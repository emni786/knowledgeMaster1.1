import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion } from "@/lib/ai";

async function callAI(system: string, user: string): Promise<string> {
  return chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    jsonResponse: true,
  });
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
    z.object({ focus: z.enum(["all", "apps", "ai-news"]).default("all") }).parse(input ?? {}),
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
  themes: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        linkIds: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  takeaways: z.array(z.string()).min(1),
});
export type Digest = z.infer<typeof DigestSchema>;

export const getDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ window: z.enum(["week", "month"]).default("week") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const since = new Date();
    since.setDate(since.getDate() - (data.window === "week" ? 7 : 30));

    let q = supabase
      .from("links")
      .select("id, title, summary, url, domain, content_type, tags, created_at")
      .is("deleted_at", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(60);
    if (dataNeedsScoping) q = q.eq("owner_id", userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const links = (rows ?? []) as Array<{
      id: string;
      title: string | null;
      summary: string | null;
      url: string;
      domain: string | null;
      content_type: string;
      tags: string[];
      created_at: string;
    }>;

    if (!links.length) {
      return {
        digest: {
          headline: `Nothing saved in the last ${data.window === "week" ? "7 days" : "30 days"} yet.`,
          themes: [
            {
              title: "Get started",
              summary:
                "Forward links to your Telegram bot or paste them in the library to build your first digest.",
              linkIds: [],
            },
          ],
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

const TopicAssignments = z.object({
  assignments: z.array(
    z.object({
      id: z.string(),
      topics: z.array(z.string().min(2).max(40)).min(1).max(6),
    }),
  ),
});

export const analyzeTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ force: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;

    let q = supabase
      .from("links")
      .select("id, title, summary, url, domain, content_type, tags")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!data.force) q = q.or("tags.is.null,tags.eq.{}");
    if (dataNeedsScoping) q = q.eq("owner_id", userId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const links = (rows ?? []) as Array<{
      id: string;
      title: string | null;
      summary: string | null;
      url: string;
      domain: string | null;
      content_type: string;
      tags: string[] | null;
    }>;

    if (!links.length) {
      return {
        analyzed: 0,
        updated: 0,
        message: "All links already have topics. Use 'Re-analyze all' to refresh.",
      };
    }

    const system =
      "You extract concise topical tags from saved web links to power a knowledge graph. " +
      'Reply ONLY with strict JSON: {"assignments":[{"id":"<linkId>","topics":["topic-one","topic-two"]}]}. ' +
      "Each link gets 3-6 short kebab-case topics (lowercase, hyphens, no '#'). " +
      "Prefer reusable, conceptual topics (e.g. 'machine-learning', 'startup-funding', 'rust-lang') over one-off names. " +
      "Topics should be SHARED across related links so a graph can connect them.";

    const updated: string[] = [];
    const BATCH = 25;
    for (let i = 0; i < links.length; i += BATCH) {
      const batch = links.slice(i, i + BATCH);
      const compact = batch.map((l) => ({
        id: l.id,
        title: l.title?.slice(0, 160) ?? l.url,
        domain: l.domain,
        type: l.content_type,
        summary: l.summary?.slice(0, 240) ?? "",
      }));
      const raw = await callAI(system, `Links: ${JSON.stringify(compact)}`);
      let parsed: z.infer<typeof TopicAssignments>;
      try {
        parsed = TopicAssignments.parse(JSON.parse(raw));
      } catch {
        continue;
      }
      const map = new Map(parsed.assignments.map((a) => [a.id, a.topics]));
      await Promise.all(
        batch.map(async (l) => {
          const topics = map.get(l.id);
          if (!topics?.length) return;
          const norm = Array.from(
            new Set(
              topics
                .map((t) =>
                  t
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                )
                .filter(Boolean),
            ),
          ).slice(0, 6);
          if (!norm.length) return;
          const upd = supabase.from("links").update({ tags: norm }).eq("id", l.id);
          if (dataNeedsScoping) upd.eq("owner_id", userId);
          const { error: uerr } = await upd;
          if (!uerr) updated.push(l.id);
        }),
      );
    }

    return {
      analyzed: links.length,
      updated: updated.length,
      message: `Analyzed ${links.length} link${links.length === 1 ? "" : "s"}, updated ${updated.length} with fresh topics.`,
    };
  });
