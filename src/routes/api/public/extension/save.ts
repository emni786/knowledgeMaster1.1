import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";
import { chatCompletion, getAIConfig } from "@/lib/ai";
import { publicAdmin, getDataClientForOwnerId } from "@/integrations/supabase/dual-client.server";

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "ref_src",
    ].forEach((p) => url.searchParams.delete(p));
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}
function domainOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
function detectType(u: string): string {
  const d = (domainOf(u) ?? "").toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|loom\.com/.test(d)) return "video";
  if (/github\.com|gitlab\.com/.test(d)) return "repo";
  if (/docs?\.|developer\./.test(d)) return "docs";
  if (/twitter\.com|x\.com|reddit\.com|news\.ycombinator/.test(d)) return "thread";
  return "article";
}

interface BilingualSummary {
  title: string | null;
  title_bn: string | null;
  summary: string | null;
  summary_bn: string | null;
  key_points: string[];
  tags: string[];
}

async function summarize(url: string, title?: string): Promise<BilingualSummary> {
  if (!(await getAIConfig())) {
    return {
      title: title ?? null,
      title_bn: title ?? null,
      summary: null,
      summary_bn: null,
      key_points: [],
      tags: [],
    };
  }
  try {
    const raw = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You analyze URLs for a personal knowledge library. Reply with STRICT JSON only, matching: " +
            `{"title":"<English title>","title_bn":"<Bangla title>","summary":"<English 3-5 sentences>","summary_bn":"<Bangla 3-5 sentences>","key_points":["<bullet>","3-5 items"],"tags":["kebab-case","3-6"]}. ` +
            "title_bn / summary_bn MUST be in Bangla script (বাংলা) but keep technical / proper-noun terms (React, API, GitHub, LLM, etc.) in English. " +
            "summary covers WHAT it is, the KEY substance, and WHO/WHY it's useful. No marketing fluff. " +
            "tags are lowercase kebab-case slugs. key_points are concrete English bullets <= 140 chars each.",
        },
        { role: "user", content: `URL: ${url}${title ? `\nPage title: ${title}` : ""}` },
      ],
      jsonResponse: true,
    });
    const p = JSON.parse(raw) as {
      title?: string;
      title_bn?: string;
      summary?: string;
      summary_bn?: string;
      key_points?: string[];
      tags?: string[];
    };
    return {
      title: p.title?.slice(0, 200) ?? title ?? null,
      title_bn: p.title_bn?.slice(0, 200) ?? p.title?.slice(0, 200) ?? title ?? null,
      summary: p.summary?.slice(0, 1200) ?? null,
      summary_bn: p.summary_bn?.slice(0, 1400) ?? p.summary?.slice(0, 1200) ?? null,
      key_points: Array.isArray(p.key_points)
        ? p.key_points
            .slice(0, 5)
            .map((k) => String(k).trim())
            .filter(Boolean)
        : [],
      tags: Array.isArray(p.tags)
        ? p.tags
            .slice(0, 6)
            .map((t) => t.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))
            .filter(Boolean)
        : [],
    };
  } catch {
    return {
      title: title ?? null,
      title_bn: title ?? null,
      summary: null,
      summary_bn: null,
      key_points: [],
      tags: [],
    };
  }
}

const Body = z.object({
  url: z.string().url(),
  title: z.string().max(500).optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/extension/save")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const raw = auth.replace(/^Bearer\s+/i, "").trim();
        if (!raw)
          return new Response(JSON.stringify({ error: "Missing token" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });

        const token_hash = createHash("sha256").update(raw).digest("hex");
        // api_tokens lives on PUBLIC Supabase (auth-source).
        const { data: tok } = await publicAdmin
          .from("api_tokens")
          .select("id, owner_id")
          .eq("token_hash", token_hash)
          .maybeSingle();
        if (!tok)
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { "content-type": "application/json", ...CORS },
          });

        const body = await request.json().catch(() => null);
        const parsed = Body.safeParse(body);
        if (!parsed.success)
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });

        const url = parsed.data.url;
        const norm = normalizeUrl(url);
        const dom = domainOf(norm);

        // links lives on PERSONAL Supabase when the owner is the configured
        // admin (and PERSONAL_* env vars are set), otherwise on PUBLIC.
        const dataDb = await getDataClientForOwnerId(tok.owner_id);

        // Dedupe (scoped by owner_id on the right database).
        const { data: existing } = await dataDb
          .from("links")
          .select("id")
          .eq("owner_id", tok.owner_id)
          .or(`normalized_url.eq.${norm},url.eq.${url}`)
          .is("deleted_at", null)
          .maybeSingle();
        if (existing) {
          await publicAdmin
            .from("api_tokens")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", tok.id);
          return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            status: 200,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const ai = await summarize(url, parsed.data.title);
        const fallbackTitle = ai.title ?? parsed.data.title ?? dom ?? url;
        const fallbackSummary = ai.summary ?? `Saved from browser (${dom ?? "link"}).`;
        const { error } = await dataDb.from("links").insert({
          owner_id: tok.owner_id,
          url,
          normalized_url: norm,
          domain: dom,
          content_type: detectType(url),
          status: "ready",
          source: "import",
          title: fallbackTitle,
          title_bn: ai.title_bn ?? fallbackTitle,
          summary: fallbackSummary,
          summary_bn: ai.summary_bn ?? fallbackSummary,
          key_points: ai.key_points,
          tags: ai.tags,
          fetched_at: new Date().toISOString(),
        });
        if (error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json", ...CORS },
          });

        await publicAdmin
          .from("api_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", tok.id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS },
        });
      },
    },
  },
});
