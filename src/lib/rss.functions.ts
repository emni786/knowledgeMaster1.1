import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getDomain(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function pick(xml: string, re: RegExp): string {
  return decodeEntities(xml.match(re)?.[1] ?? "");
}

type FeedItem = { title: string; url: string };
type ParsedFeed = { title: string; siteUrl: string; items: FeedItem[] };

function parseFeed(xml: string): ParsedFeed {
  // RSS 2.0
  if (/<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml)) {
    const channelMatch = xml.match(/<channel[\s\S]*?>([\s\S]*?)<\/channel>/i);
    const channel = channelMatch?.[1] ?? "";
    const title = pick(channel, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const siteUrl = pick(channel, /<link[^>]*>([\s\S]*?)<\/link>/i);

    const items: FeedItem[] = [];
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const t = pick(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const l = pick(block, /<link[^>]*>([\s\S]*?)<\/link>/i);
      if (l) items.push({ title: t || l, url: l });
    }
    return { title, siteUrl, items };
  }

  // Atom
  if (/<feed[\s>]/i.test(xml)) {
    const title = pick(xml, /<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
    const siteUrl =
      xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      xml.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      "";
    const items: FeedItem[] = [];
    const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const block = m[1];
      const t = pick(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const l =
        block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
        block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
        "";
      if (l) items.push({ title: t || l, url: l });
    }
    return { title: decodeEntities(title), siteUrl: decodeEntities(siteUrl), items };
  }

  return { title: "", siteUrl: "", items: [] };
}

async function fetchFeed(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; KnowledgemasterBot/1.0)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export const listRssFeeds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    let q = supabase.from("rss_feeds").select("*").order("created_at", { ascending: false });
    if (dataNeedsScoping) q = q.eq("owner_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addRssFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ url: z.string().url().max(2048) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const url = data.url.trim();
    const domain = getDomain(url);

    let parsed: ParsedFeed = { title: "", siteUrl: "", items: [] };
    let lastError: string | null = null;
    try {
      const xml = await fetchFeed(url);
      parsed = parseFeed(xml);
      if (parsed.items.length === 0) lastError = "Feed parsed but contained no items";
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Failed to fetch feed";
    }

    const { data: row, error } = await supabase
      .from("rss_feeds")
      .insert({
        owner_id: userId,
        url,
        title: parsed.title || domain || url,
        site_url: parsed.siteUrl || null,
        domain,
        last_error: lastError,
        last_fetched_at: lastError ? null : new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("This feed is already added");
      throw new Error(error.message);
    }
    return row;
  });

export const deleteRssFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const del = supabase.from("rss_feeds").delete().eq("id", data.id);
    if (dataNeedsScoping) del.eq("owner_id", userId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRssFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase.from("rss_feeds").update({ active: data.active }).eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshRssFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;

    const fq = supabase.from("rss_feeds").select("*").eq("id", data.id);
    if (dataNeedsScoping) fq.eq("owner_id", userId);
    const { data: feed, error: fErr } = await fq.single();
    if (fErr || !feed) throw new Error(fErr?.message ?? "Feed not found");

    let parsed: ParsedFeed;
    try {
      const xml = await fetchFeed(feed.url);
      parsed = parseFeed(xml);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      const eUpd = supabase
        .from("rss_feeds")
        .update({ last_error: msg, last_fetched_at: new Date().toISOString() })
        .eq("id", feed.id);
      if (dataNeedsScoping) eUpd.eq("owner_id", userId);
      await eUpd;
      throw new Error(msg);
    }

    if (parsed.items.length === 0) {
      const noUpd = supabase
        .from("rss_feeds")
        .update({
          last_error: "No items in feed",
          last_fetched_at: new Date().toISOString(),
        })
        .eq("id", feed.id);
      if (dataNeedsScoping) noUpd.eq("owner_id", userId);
      await noUpd;
      return { imported: 0, skipped: 0 };
    }

    // Find which item URLs we already have
    const itemUrls = parsed.items.map((it) => it.url);
    const { data: existing } = await supabase
      .from("links")
      .select("url")
      .eq("owner_id", userId)
      .in("url", itemUrls);
    const existingSet = new Set((existing ?? []).map((r) => r.url));

    const newItems = parsed.items.filter((it) => !existingSet.has(it.url));

    if (newItems.length > 0) {
      const rows = newItems.slice(0, 50).map((it) => ({
        owner_id: userId,
        url: it.url,
        normalized_url: it.url,
        domain: getDomain(it.url),
        title: it.title || it.url,
        summary: `From RSS: ${feed.title ?? feed.domain ?? feed.url}`,
        content_type: "article" as const,
        status: "ready" as const,
        tags: ["rss"],
        source: "rss",
        fetched_at: new Date().toISOString(),
      }));
      const { error: insErr } = await supabase.from("links").insert(rows);
      if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
    }

    const finalUpd = supabase
      .from("rss_feeds")
      .update({
        last_fetched_at: new Date().toISOString(),
        last_error: null,
        items_imported: (feed.items_imported ?? 0) + newItems.length,
        title: feed.title || parsed.title || feed.domain,
        site_url: feed.site_url || parsed.siteUrl || null,
      })
      .eq("id", feed.id);
    if (dataNeedsScoping) finalUpd.eq("owner_id", userId);
    await finalUpd;

    return { imported: newItems.length, skipped: parsed.items.length - newItems.length };
  });
