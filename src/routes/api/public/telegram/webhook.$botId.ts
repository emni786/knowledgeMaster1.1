import { createFileRoute } from "@tanstack/react-router";
import { chatCompletion, getAIConfig } from "@/lib/ai";
import { publicAdmin, getDataClientForOwnerId } from "@/integrations/supabase/dual-client.server";

const TG_API = "https://api.telegram.org";

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

function extractUrls(text: string | undefined | null): string[] {
  if (!text) return [];
  const matches = text.match(URL_RE) ?? [];
  return Array.from(new Set(matches.map((u) => u.replace(/[)\].,;!?]+$/, ""))));
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function detectType(url: string): string {
  const d = domainOf(url) ?? "";
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(d)) return "video";
  if (/github\.com|gitlab\.com/.test(d)) return "repo";
  if (/docs\.google|notion\.so|hackmd/.test(d)) return "doc";
  if (/twitter\.com|x\.com|reddit\.com|news\.ycombinator/.test(d)) return "social";
  return "article";
}

async function summarize(url: string): Promise<{ title: string | null; summary: string | null }> {
  if (!(await getAIConfig())) return { title: null, summary: null };
  try {
    const raw = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            'You analyze URLs for a knowledge library. Reply with strict JSON only: {"title":"...","summary":"..."}. Title <= 90 chars. Summary 1-2 sentences <= 240 chars.',
        },
        { role: "user", content: `URL: ${url}` },
      ],
      jsonResponse: true,
    });
    const parsed = JSON.parse(raw) as { title?: string; summary?: string };
    return {
      title: parsed.title?.slice(0, 200) ?? null,
      summary: parsed.summary?.slice(0, 1000) ?? null,
    };
  } catch {
    return { title: null, summary: null };
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook/$botId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // telegram_bots lives on PUBLIC Supabase (auth-source).
        const { data: bot } = await publicAdmin
          .from("telegram_bots")
          .select("id, owner_id, bot_token, webhook_secret, active")
          .eq("id", params.botId)
          .maybeSingle();

        if (!bot || !bot.active) return new Response("Not found", { status: 404 });

        const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (provided !== bot.webhook_secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json().catch(() => null)) as {
          message?: {
            chat?: { id: number };
            text?: string;
            caption?: string;
            entities?: Array<{ type: string; url?: string }>;
          };
          edited_message?: unknown;
          channel_post?: unknown;
        } | null;
        const msg = (update?.message ??
          (update as Record<string, unknown> | null)?.channel_post ??
          (update as Record<string, unknown> | null)?.edited_message) as
          | {
              chat?: { id: number };
              text?: string;
              caption?: string;
              entities?: Array<{ type: string; url?: string }>;
            }
          | undefined;
        if (!msg) return Response.json({ ok: true });

        const text = `${msg.text ?? ""} ${msg.caption ?? ""}`.trim();
        const entityUrls = (msg.entities ?? [])
          .filter((e) => e.type === "url" || e.type === "text_link")
          .map((e) => e.url)
          .filter((u): u is string => Boolean(u));
        const urls = Array.from(new Set([...extractUrls(text), ...entityUrls]));

        const chatId = msg.chat?.id;
        const botToken = bot.bot_token;

        // Remember most recent chat for forwarding website-saved links back to Telegram
        if (chatId) {
          await publicAdmin
            .from("telegram_bots")
            .update({ default_chat_id: chatId })
            .eq("id", bot.id)
            .then(
              () => undefined,
              () => undefined,
            );
        }

        async function reply(textBody: string) {
          if (!chatId) return;
          await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: textBody,
              disable_web_page_preview: true,
            }),
          }).catch(() => {});
        }

        if (!urls.length) {
          await reply("Send me a link and I'll save it to your Knowledgemaster library.");
          return Response.json({ ok: true });
        }

        // links is routed: PERSONAL for admin owners, PUBLIC otherwise.
        const dataDb = await getDataClientForOwnerId(bot.owner_id);

        let saved = 0;
        for (const url of urls) {
          const norm = normalize(url);
          const dom = domainOf(norm);
          const ai = await summarize(url);
          const { error } = await dataDb.from("links").insert({
            owner_id: bot.owner_id,
            url,
            normalized_url: norm,
            domain: dom,
            content_type: detectType(url),
            status: "ready",
            source: "telegram",
            title: ai.title ?? dom ?? url,
            summary: ai.summary ?? `Saved from Telegram (${dom ?? "link"}).`,
            tags: [],
            fetched_at: new Date().toISOString(),
          });
          if (!error) saved++;
        }

        await reply(
          saved === urls.length
            ? `Saved ${saved} link${saved === 1 ? "" : "s"} to your library.`
            : `Saved ${saved} of ${urls.length} links.`,
        );

        return Response.json({ ok: true, saved });
      },
    },
  },
});
