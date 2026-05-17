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

async function summarize(
  url: string,
  title?: string,
): Promise<{ title: string | null; summary: string | null; tags: string[] }> {
  if (!(await getAIConfig())) return { title: title ?? null, summary: null, tags: [] };
  try {
    const raw = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            'Reply with strict JSON: {"title":"...","summary":"...","tags":["kebab-case"]}. Title <=120 chars, summary <=280, 1-5 tags lowercase kebab.',
        },
        { role: "user", content: `URL: ${url}${title ? `\nPage title: ${title}` : ""}` },
      ],
      jsonResponse: true,
    });
    const p = JSON.parse(raw) as { title?: string; summary?: string; tags?: string[] };
    return {
      title: p.title?.slice(0, 200) ?? title ?? null,
      summary: p.summary?.slice(0, 1000) ?? null,
      tags: Array.isArray(p.tags)
        ? p.tags
            .slice(0, 6)
            .map((t) => t.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))
            .filter(Boolean)
        : [],
    };
  } catch {
    return { title: title ?? null, summary: null, tags: [] };
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
        const { error } = await dataDb.from("links").insert({
          owner_id: tok.owner_id,
          url,
          normalized_url: norm,
          domain: dom,
          content_type: detectType(url),
          status: "ready",
          source: "import",
          title: ai.title ?? parsed.data.title ?? dom ?? url,
          summary: ai.summary ?? `Saved from browser (${dom ?? "link"}).`,
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
