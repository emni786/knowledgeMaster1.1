import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI gateway is not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

const TrendingItem = z.object({
  title: z.string(),
  summary: z.string(),
  url: z.string(),
  category: z.enum(["app", "ai-news", "tool", "research"]).default("ai-news"),
  source: z.string().optional().nullable(),
});
export type TrendingItem = z.infer<typeof TrendingItem>;

export const getTrending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ focus: z.enum(["all", "apps", "ai-news"]).default("all") }).parse(input ?? {})
  )
  .handler(async ({ data }) => {
    const focusText =
      data.focus === "apps"
        ? "trending consumer & developer apps launched recently"
        : data.focus === "ai-news"
        ? "the latest AI news, model releases, and research breakthroughs"
        : "a balanced mix of trending apps AND latest AI news";

    const system =
      "You are a tech trends curator. Reply with strict JSON only: " +
      `{"items":[{"title":"...","summary":"1-2 sentences","url":"https://...","category":"app|ai-news|tool|research","source":"domain"}]}. ` +
      "Pick 8-10 high-signal items. Use real, well-known URLs (Product Hunt pages, official blogs, arXiv, GitHub, TechCrunch, The Verge, etc.). No duplicates.";
    const user = `Curate ${focusText}. Today's date context: ${new Date().toISOString().slice(0, 10)}.`;

    const raw = await callAI(system, user);
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = z.object({ items: z.array(TrendingItem).min(1) }).parse(parsed).items;
    return { items, generatedAt: new Date().toISOString() };
  });

const DigestSchema = z.object({
  headline: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      linkIds: z.array(z.string()).default([]),
    })
  ).min(1),
  takeaways: z.array(z.string()).min(1),
});
export type Digest = z.infer<typeof DigestSchema>;

export const getDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ window: z.enum(["week", "month"]).default("week") }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date();
    since.setDate(since.getDate() - (data.window === "week" ? 7 : 30));

    const { data: rows, error } = await supabase
      .from("links")
      .select("id, title, summary, url, domain, content_type, tags, created_at")
      .is("deleted_at", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const links = (rows ?? []) as Array<{
      id: string; title: string | null; summary: string | null;
      url: string; domain: string | null; content_type: string;
      tags: string[]; created_at: string;
    }>;

    if (!links.length) {
      return {
        digest: {
          headline: `Nothing saved in the last ${data.window === "week" ? "7 days" : "30 days"} yet.`,
          themes: [{ title: "Get started", summary: "Forward links to your Telegram bot or paste them in the library to build your first digest.", linkIds: [] }],
          takeaways: ["Connect a Telegram bot in Settings to ingest links on the go."],
        } satisfies Digest,
        count: 0,
        window: data.window,
      };
    }

    const compact = links.map((l) => ({
      id: l.id,
      title: l.title?.slice(0, 140) ?? l.url,
      domain: l.domain,
      type: l.content_type,
      summary: l.summary?.slice(0, 200) ?? "",
      tags: l.tags?.slice(0, 6) ?? [],
    }));

    const system =
      "You write punchy newsletter-style digests for a personal knowledge library. " +
      'Reply with strict JSON: {"headline":"...","themes":[{"title":"...","summary":"2-3 sentences","linkIds":["..."]}],"takeaways":["...","..."]}. ' +
      "Group 3-5 themes. Each theme groups related linkIds from input. 3-5 takeaways total.";
    const user = `Saved links from the past ${data.window}: ${JSON.stringify(compact)}`;

    const raw = await callAI(system, user);
    const parsed = JSON.parse(raw);
    const digest = DigestSchema.parse(parsed);
    return { digest, count: links.length, window: data.window, links };
  });
