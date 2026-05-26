import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion, getAIConfig } from "@/lib/ai";

const ContentType = z.enum(["article", "video", "repo", "docs", "tool", "thread", "other"]);

const Analysis = z.object({
  title: z.string().min(1).max(200),
  title_bn: z.string().min(1).max(200),
  summary: z.string().min(1).max(700),
  summary_bn: z.string().min(1).max(900),
  key_points: z.array(z.string().min(2).max(160)).min(0).max(6).default([]),
  tags: z.array(z.string().min(2).max(40)).min(1).max(6),
  content_type: ContentType,
});
type Analysis = z.infer<typeof Analysis>;

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
function getDomain(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
function detectType(u: string, html?: string): Analysis["content_type"] {
  const d = (getDomain(u) ?? "").toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|loom\.com/.test(d)) return "video";
  if (/github\.com|gitlab\.com|bitbucket\.org/.test(d)) return "repo";
  if (/docs?\.|developer\.|\.dev\b|readthedocs/.test(d)) return "docs";
  if (/twitter\.com|x\.com|threads\.net|reddit\.com|news\.ycombinator/.test(d)) return "thread";
  if (html && /<meta[^>]+property=["']og:type["'][^>]+content=["']video/i.test(html))
    return "video";
  if (html && /<meta[^>]+property=["']og:type["'][^>]+content=["']article/i.test(html))
    return "article";
  return "article";
}

// Robust meta extractor that handles either attribute order
// (`property=... content=...` and `content=... property=...`) plus JSON-LD
// structured data. Many social platforms (especially Facebook share URLs)
// emit attributes in non-standard orders or hide the summary inside
// JSON-LD only, so the simple property-first regex used to miss everything.
function extractMeta(html: string): { title: string; description: string; siteName: string } {
  const attrs = new Map<string, string>();
  const metaRe = /<meta\b([^>]+)>/gi;

  const readAttr = (chunk: string, name: string): string | null => {
    const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const m = chunk.match(re);
    return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
  };

  let match: RegExpExecArray | null;
  while ((match = metaRe.exec(html)) !== null) {
    const inner = match[1];
    const key =
      readAttr(inner, "property") ?? readAttr(inner, "name") ?? readAttr(inner, "itemprop");
    const value = readAttr(inner, "content");
    if (key && value) {
      const k = key.toLowerCase();
      if (!attrs.has(k)) attrs.set(k, value);
    }
  }

  let ldTitle = "";
  let ldDescription = "";
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]+?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRe.exec(html)) !== null) {
    try {
      const node = JSON.parse(ldMatch[1].trim());
      const items = Array.isArray(node) ? node : [node];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        if (!ldTitle) {
          const candidate =
            (typeof obj.headline === "string" && obj.headline) ||
            (typeof obj.name === "string" && obj.name) ||
            "";
          if (candidate) ldTitle = candidate;
        }
        if (!ldDescription) {
          const candidate =
            (typeof obj.description === "string" && obj.description) ||
            (typeof obj.articleBody === "string" && obj.articleBody.slice(0, 600)) ||
            "";
          if (candidate) ldDescription = candidate;
        }
        if (ldTitle && ldDescription) break;
      }
    } catch {
      /* ignore malformed JSON-LD blocks */
    }
    if (ldTitle && ldDescription) break;
  }

  const docTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const docTitle = docTitleMatch ? docTitleMatch[1].trim() : "";

  const title = attrs.get("og:title") || attrs.get("twitter:title") || ldTitle || docTitle;
  const description =
    attrs.get("og:description") ||
    attrs.get("twitter:description") ||
    attrs.get("description") ||
    ldDescription;
  const siteName =
    attrs.get("og:site_name") || attrs.get("application-name") || attrs.get("twitter:site") || "";

  return {
    title: decodeEntities(title || ""),
    description: decodeEntities(description || ""),
    siteName: decodeEntities(siteName),
  };
}
// Named HTML entities we want to handle in OG / meta text and in the
// stripped page body. Kept small on purpose; we lean on the numeric / hex
// fallback below for anything more exotic.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  laquo: "\u00ab",
  raquo: "\u00bb",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  bull: "\u2022",
  middot: "\u00b7",
};

// Decodes the entity flavours we actually see in the wild:
// * named entities (`&amp;`, `&nbsp;`, `&hellip;`, ...).
// * decimal numeric references (`&#9989;`).
// * hex numeric references (`&#x9a1;`, `&#xff1c;`). Facebook in particular
//   emits Bangla / non-Latin OG tags using hex escapes, so missing this
//   case caused titles to land in the DB as the literal text
//   "UI &#x9a1;&#x9bf;..." instead of "UI ডিজাইনারদের ...".
// Uses `String.fromCodePoint` so astral characters (emoji, CJK extension B)
// round-trip correctly too.
function decodeEntities(s: string): string {
  if (!s) return s;
  return s.replace(
    /&(?:#(x?)([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]+));/g,
    (raw, hexFlag, code, name) => {
      if (name) {
        const replacement = NAMED_ENTITIES[name.toLowerCase()];
        return replacement ?? raw;
      }
      try {
        const num = hexFlag ? parseInt(code, 16) : parseInt(code, 10);
        if (!Number.isFinite(num) || num <= 0 || num > 0x10ffff) return raw;
        return String.fromCodePoint(num);
      } catch {
        return raw;
      }
    },
  );
}
function stripHtml(html: string): string {
  // Prefer the main article body when present so the AI doesn't waste its
  // budget on navigation chrome and footer boilerplate.
  const mainMatch =
    html.match(/<article\b[\s\S]*?<\/article>/i) ?? html.match(/<main\b[\s\S]*?<\/main>/i);
  const source = mainMatch && mainMatch[0].length > 600 ? mainMatch[0] : html;
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Decode entities AFTER stripping tags so the AI sees real Bangla / CJK /
  // emoji characters instead of `&#x9a1;`-style escapes.
  return decodeEntities(text);
}

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Many sites (Facebook, X/Twitter, LinkedIn, Instagram) serve a useful Open
// Graph payload to the well-known social scrapers but a login wall to
// everyone else. We pick a UA that matches the platform and fall back to
// Chrome on retry.
function socialBotUAFor(domain: string | null): string | null {
  const d = (domain ?? "").toLowerCase();
  if (/(^|\.)(facebook|fb)\.com$|(^|\.)fb\.me$|(^|\.)messenger\.com$/.test(d)) {
    return "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
  }
  if (/(^|\.)(twitter|x)\.com$/.test(d)) return "Twitterbot/1.0";
  if (/(^|\.)linkedin\.com$/.test(d)) return "LinkedInBot/1.0";
  if (/(^|\.)instagram\.com$/.test(d)) return "facebookexternalhit/1.1";
  if (/(^|\.)tiktok\.com$/.test(d)) return "Twitterbot/1.0";
  return null;
}

// Facebook's `www.facebook.com/story.php?...` and `share/` URLs render almost
// nothing useful for non-logged-in clients, but the mobile basic variant
// returns a static HTML page with the actual post body. Try it as a fallback.
function fallbackVariantsFor(url: string): string[] {
  try {
    const u = new URL(url);
    const variants: string[] = [];
    if (/(^|\.)facebook\.com$/.test(u.hostname)) {
      const mb = new URL(url);
      mb.hostname = "mbasic.facebook.com";
      variants.push(mb.toString());
    }
    return variants;
  } catch {
    return [];
  }
}

function looksUseful(html: string): boolean {
  if (!html) return false;
  if (
    /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:title|og:description|twitter:title|twitter:description)["']/i.test(
      html,
    )
  ) {
    return true;
  }
  if (/<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html)) return true;
  // > 4 KB stripped text is usually a real document, not a login wall.
  return stripHtml(html).length > 4_000;
}

async function tryFetch(url: string, ua: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": ua,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,bn;q=0.7",
        "cache-control": "no-cache",
      },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("xml")) return "";
    const text = await res.text();
    return text.slice(0, 400_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function fetchPage(url: string): Promise<string> {
  const domain = getDomain(url);
  const socialUA = socialBotUAFor(domain);
  const attempts: Array<{ url: string; ua: string }> = [];
  // Social scrapers first when applicable — they bypass login walls.
  if (socialUA) attempts.push({ url, ua: socialUA });
  attempts.push({ url, ua: CHROME_UA });
  for (const variant of fallbackVariantsFor(url)) {
    attempts.push({ url: variant, ua: socialUA ?? CHROME_UA });
    attempts.push({ url: variant, ua: CHROME_UA });
  }

  let best = "";
  for (const attempt of attempts) {
    const html = await tryFetch(attempt.url, attempt.ua);
    if (looksUseful(html)) return html;
    if (html.length > best.length) best = html;
  }
  return best;
}

async function aiAnalyze(input: {
  url: string;
  domain: string | null;
  meta: { title: string; description: string; siteName: string };
  bodyText: string;
}): Promise<Analysis | null> {
  if (!(await getAIConfig())) return null;

  const system =
    "You are a meticulous web-link analyzer producing bilingual (English + Bangla) metadata for a personal knowledge library. " +
    "Reply with STRICT JSON ONLY, no prose, matching exactly this schema:\n" +
    `{"title":"<concise English title>","title_bn":"<Bangla title>","summary":"<English summary, 3-5 sentences>","summary_bn":"<Bangla summary, 3-5 sentences>","key_points":["<short English bullet>","3 to 5 items"],"tags":["kebab-case","3 to 6"],"content_type":"article|video|repo|docs|tool|thread|other"}.\n` +
    "Rules:\n" +
    "- title: concise canonical English title, <= 140 chars, no clickbait, no site name suffix.\n" +
    "- title_bn: natural Bangla title in Bangla script (বাংলা). Keep technical / proper nouns in English (e.g. React, TypeScript, GPU, GitHub, OpenAI, API, LLM, machine learning, startup). Do NOT transliterate them. <= 160 chars.\n" +
    "- summary: 3 to 5 sentence English paragraph. Cover: WHAT it is, the KEY substance / main idea, and WHO it's useful for or WHY it matters. Be concrete, specific, neutral. No marketing fluff, no 'this article discusses' filler. 280-600 chars target.\n" +
    "- summary_bn: same content as summary but in natural Bangla (Bangla script). MUST preserve all technical / proper-noun terms in English exactly (React, API, framework, dataset, etc.). Read like a knowledgeable Bangla speaker explaining it to a friend. 3 to 5 sentences. 320-800 chars target.\n" +
    "- key_points: 3 to 5 short English bullet highlights (each <= 140 chars). Concrete facts / takeaways extracted from the content. No duplication of the summary's opening sentence.\n" +
    "- tags: 3 to 6 conceptual, reusable lowercase kebab-case slugs (e.g. 'machine-learning','rust-lang','startup-funding'). No '#'.\n" +
    "- content_type: best single match from the enum.\n" +
    "If the page content is thin (e.g. only a title), still produce useful bilingual output based on the URL, domain, and title — never refuse, never leave fields empty.";

  const user = JSON.stringify({
    url: input.url,
    domain: input.domain,
    og_title: input.meta.title.slice(0, 300),
    og_description: input.meta.description.slice(0, 1200),
    site: input.meta.siteName.slice(0, 80),
    body_excerpt: input.bodyText.slice(0, 5000),
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      jsonResponse: true,
      signal: ctrl.signal,
    });
    const parsed = Analysis.parse(JSON.parse(raw));
    parsed.tags = Array.from(
      new Set(
        parsed.tags
          .map((t) =>
            t
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, "-")
              .replace(/^-+|-+$/g, ""),
          )
          .filter(Boolean),
      ),
    ).slice(0, 6);
    parsed.key_points = (parsed.key_points ?? [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .slice(0, 5);
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function analyzeOne(
  url: string,
): Promise<{ analysis: Analysis; domain: string | null; html_present: boolean }> {
  const domain = getDomain(url);
  const html = await fetchPage(url);
  const meta = html ? extractMeta(html) : { title: "", description: "", siteName: "" };
  const bodyText = html ? stripHtml(html).slice(0, 6000) : "";

  const ai = await aiAnalyze({ url, domain, meta, bodyText });
  if (ai) return { analysis: ai, domain, html_present: !!html };

  // Fallback: deterministic but useful. Bangla fields mirror English when
  // the AI is unavailable; UI displays them transparently.
  const fallback: Analysis = {
    title: meta.title || domain || url,
    title_bn: meta.title || domain || url,
    summary: meta.description || `Saved link from ${domain ?? "the web"}.`,
    summary_bn: meta.description || `${domain ?? "web"} থেকে save করা link।`,
    key_points: [],
    tags: domain
      ? [
          domain
            .split(".")[0]
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-"),
        ]
      : ["uncategorized"],
    content_type: detectType(url, html),
  };
  return { analysis: fallback, domain, html_present: !!html };
}

// Insert pending rows immediately and return their ids. The caller is
// expected to follow up with `analyzeLinks` (typically fire-and-forget from
// the browser) so the heavy AI work doesn't block the Add button.
export const saveLinksPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ urls: z.array(z.string().url()).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const urls = Array.from(new Set(data.urls.map((u) => u.trim()).filter(Boolean)));
    const pendingRows = urls.map((url) => {
      const norm = normalizeUrl(url);
      const domain = getDomain(norm);
      return {
        owner_id: userId,
        url,
        normalized_url: norm,
        domain,
        title: domain || url,
        title_bn: domain || url,
        summary: "Analyzing…",
        summary_bn: "Analyzing…",
        key_points: [] as string[],
        content_type: "other" as const,
        status: "pending" as const,
        tags: [] as string[],
      };
    });
    const { data: inserted, error } = await supabase
      .from("links")
      .insert(pendingRows)
      .select("id, url");
    if (error) throw new Error(error.message);
    return {
      ids: (inserted ?? []).map((r) => r.id as string),
      count: inserted?.length ?? 0,
    };
  });

// Run AI analysis for already-inserted rows. Frontend calls this without
// awaiting so the Add button stays snappy; the realtime subscription on
// `links` pushes the status transitions back to the UI.
export const analyzeLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, publicClient, userId, dataNeedsScoping } = context;
    const sel = supabase.from("links").select("id, url").in("id", data.ids);
    if (dataNeedsScoping) sel.eq("owner_id", userId);
    const { data: rows, error: selErr } = await sel;
    if (selErr) throw new Error(selErr.message);

    const results = await Promise.all(
      (rows ?? []).map(async (row) => {
        try {
          const { analysis } = await analyzeOne(row.url as string);
          const upd = supabase
            .from("links")
            .update({
              title: analysis.title,
              title_bn: analysis.title_bn,
              summary: analysis.summary,
              summary_bn: analysis.summary_bn,
              key_points: analysis.key_points,
              tags: analysis.tags,
              content_type: analysis.content_type,
              status: "ready",
              error_message: null,
              fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (dataNeedsScoping) upd.eq("owner_id", userId);
          await upd;
          return {
            url: row.url as string,
            title: analysis.title,
            summary: analysis.summary,
            ok: true,
          };
        } catch (e) {
          const upd = supabase
            .from("links")
            .update({
              status: "failed",
              error_message: e instanceof Error ? e.message : "Analysis failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (dataNeedsScoping) upd.eq("owner_id", userId);
          await upd;
          return { url: row.url as string, title: null, summary: null, ok: false };
        }
      }),
    );

    try {
      const { data: bots } = await publicClient
        .from("telegram_bots")
        .select("bot_token, default_chat_id, active")
        .eq("active", true);
      const targets = (
        (bots ?? []) as Array<{
          bot_token: string;
          default_chat_id: number | null;
          active: boolean;
        }>
      ).filter((b) => b.default_chat_id);
      if (targets.length) {
        const successes = results.filter((r) => r.ok);
        await Promise.all(
          targets.flatMap((b) =>
            successes.map((r) => {
              const text = `🔖 Saved to your library\n${r.title ? r.title + "\n" : ""}${r.url}${r.summary ? `\n\n${r.summary}` : ""}`;
              return fetch(`https://api.telegram.org/bot${b.bot_token}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  chat_id: b.default_chat_id,
                  text: text.slice(0, 4000),
                  disable_web_page_preview: false,
                }),
              }).catch(() => undefined);
            }),
          ),
        );
      }
    } catch {
      // Non-fatal: forwarding failure shouldn't break link save
    }

    return { count: results.length };
  });

export const analyzeAndSaveLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ urls: z.array(z.string().url()).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, publicClient, userId, dataNeedsScoping } = context;

    const urls = Array.from(new Set(data.urls.map((u) => u.trim()).filter(Boolean)));

    // 1) Insert pending rows immediately. owner_id is always set explicitly
    //    so this row insert is safe on both PUBLIC-RLS and PERSONAL-service-role.
    const pendingRows = urls.map((url) => {
      const norm = normalizeUrl(url);
      const domain = getDomain(norm);
      return {
        owner_id: userId,
        url,
        normalized_url: norm,
        domain,
        title: domain || url,
        title_bn: domain || url,
        summary: "Analyzing…",
        summary_bn: "Analyzing…",
        key_points: [] as string[],
        content_type: "other" as const,
        status: "pending" as const,
        tags: [] as string[],
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("links")
      .insert(pendingRows)
      .select("id, url");
    if (insertErr) throw new Error(insertErr.message);

    // 2) Analyze in parallel (bounded by input cap of 20)
    const results = await Promise.all(
      (inserted ?? []).map(async (row) => {
        try {
          const { analysis } = await analyzeOne(row.url);
          // When admin uses PERSONAL (service-role) we MUST scope by owner_id
          // because RLS is bypassed. For non-admin on PUBLIC, RLS already
          // scopes by auth.uid() but the extra filter is harmless.
          const upd = supabase
            .from("links")
            .update({
              title: analysis.title,
              title_bn: analysis.title_bn,
              summary: analysis.summary,
              summary_bn: analysis.summary_bn,
              key_points: analysis.key_points,
              tags: analysis.tags,
              content_type: analysis.content_type,
              status: "ready",
              error_message: null,
              fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (dataNeedsScoping) upd.eq("owner_id", userId);
          await upd;
          return { url: row.url, title: analysis.title, summary: analysis.summary, ok: true };
        } catch (e) {
          const upd = supabase
            .from("links")
            .update({
              status: "failed",
              error_message: e instanceof Error ? e.message : "Analysis failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (dataNeedsScoping) upd.eq("owner_id", userId);
          await upd;
          return { url: row.url, title: null, summary: null, ok: false };
        }
      }),
    );

    // 3) Forward saved links to user's Telegram bot(s) — fire and forget.
    //    telegram_bots is an auth-source table, always on PUBLIC Supabase,
    //    so we read it via publicClient (RLS-bound to the current user).
    try {
      const { data: bots } = await publicClient
        .from("telegram_bots")
        .select("bot_token, default_chat_id, active")
        .eq("active", true);
      const targets = (
        (bots ?? []) as Array<{
          bot_token: string;
          default_chat_id: number | null;
          active: boolean;
        }>
      ).filter((b) => b.default_chat_id);
      if (targets.length) {
        const successes = results.filter((r) => r.ok);
        await Promise.all(
          targets.flatMap((b) =>
            successes.map((r) => {
              const text = `🔖 Saved to your library\n${r.title ? r.title + "\n" : ""}${r.url}${r.summary ? `\n\n${r.summary}` : ""}`;
              return fetch(`https://api.telegram.org/bot${b.bot_token}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  chat_id: b.default_chat_id,
                  text: text.slice(0, 4000),
                  disable_web_page_preview: false,
                }),
              }).catch(() => undefined);
            }),
          ),
        );
      }
    } catch {
      // Non-fatal: forwarding failure shouldn't break link save
    }

    return { count: inserted?.length ?? 0 };
  });

// ---------------------------------------------------------------------------
// CRUD server functions for `links`. Frontend code (src/lib/api/links.ts)
// calls these so reads/writes get routed to the right Supabase database
// (PERSONAL for admin, PUBLIC otherwise).
// ---------------------------------------------------------------------------

export const listLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    let q = supabase.from("links").select("*").order("created_at", { ascending: false });
    if (dataNeedsScoping) q = q.eq("owner_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateLinkServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("links")
      .update({ ...data.patch, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const softDeleteLinkServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("links")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const softDeleteManyLinksServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("links")
      .update({ deleted_at: new Date().toISOString() } as never)
      .in("id", data.ids);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreLinkServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("links")
      .update({ deleted_at: null } as never)
      .eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const permanentlyDeleteLinkServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const del = supabase.from("links").delete().eq("id", data.id);
    if (dataNeedsScoping) del.eq("owner_id", userId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const permanentlyDeleteManyLinksServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const del = supabase.from("links").delete().in("id", data.ids);
    if (dataNeedsScoping) del.eq("owner_id", userId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreManyLinksServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("links")
      .update({ deleted_at: null } as never)
      .in("id", data.ids);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const emptyTrashServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const del = supabase.from("links").delete().not("deleted_at", "is", null);
    if (dataNeedsScoping) del.eq("owner_id", userId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkAddTagServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        tag: z.string().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const sel = supabase.from("links").select("id, tags").in("id", data.ids);
    if (dataNeedsScoping) sel.eq("owner_id", userId);
    const { data: rows, error } = await sel;
    if (error) throw new Error(error.message);
    for (const row of (rows ?? []) as Array<{ id: string; tags: string[] }>) {
      const tags = Array.from(new Set([...(row.tags || []), data.tag]));
      const upd = supabase
        .from("links")
        .update({ tags } as never)
        .eq("id", row.id);
      if (dataNeedsScoping) upd.eq("owner_id", userId);
      await upd;
    }
    return { ok: true };
  });

export const reanalyzeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    // Scope by owner_id when using PERSONAL service-role (RLS bypassed).
    const sel = supabase.from("links").select("id, url").eq("id", data.id);
    if (dataNeedsScoping) sel.eq("owner_id", userId);
    const { data: row, error } = await sel.single();
    if (error || !row) throw new Error(error?.message ?? "Link not found");

    const pendingUpd = supabase
      .from("links")
      .update({ status: "pending", error_message: null })
      .eq("id", row.id);
    if (dataNeedsScoping) pendingUpd.eq("owner_id", userId);
    await pendingUpd;

    try {
      const { analysis } = await analyzeOne(row.url);
      const readyUpd = supabase
        .from("links")
        .update({
          title: analysis.title,
          title_bn: analysis.title_bn,
          summary: analysis.summary,
          summary_bn: analysis.summary_bn,
          key_points: analysis.key_points,
          tags: analysis.tags,
          content_type: analysis.content_type,
          status: "ready",
          error_message: null,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (dataNeedsScoping) readyUpd.eq("owner_id", userId);
      await readyUpd;
      return { ok: true };
    } catch (e) {
      const failUpd = supabase
        .from("links")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : "Analysis failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (dataNeedsScoping) failUpd.eq("owner_id", userId);
      await failUpd;
      throw e;
    }
  });
