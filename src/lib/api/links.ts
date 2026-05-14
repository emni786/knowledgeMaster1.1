import { supabase } from "@/integrations/supabase/client";
import type { LinkRow, ContentType, LinkStatus } from "@/lib/types";
import { getDomain, normalizeUrl, detectContentType } from "@/lib/url";

export async function fetchLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from("links" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LinkRow[];
}

export async function addLinks(urls: string[]): Promise<LinkRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const owner_id = userData.user?.id;
  if (!owner_id) throw new Error("Not authenticated");

  const rows = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => {
      const norm = normalizeUrl(url);
      const domain = getDomain(norm);
      const fallbackTitle = domain || url;
      return {
        owner_id,
        url,
        normalized_url: norm,
        domain,
        content_type: detectContentType(url) as ContentType,
        status: "ready" as LinkStatus, // mock: mark ready immediately for demo
        title: fallbackTitle,
        summary: `Saved link from ${domain || "the web"}.`,
        tags: [],
        fetched_at: new Date().toISOString(),
      };
    });

  if (!rows.length) return [];
  const { data, error } = await supabase.from("links" as never).insert(rows as never).select();
  if (error) throw error;
  return (data ?? []) as unknown as LinkRow[];
}

export async function updateLink(id: string, patch: Partial<LinkRow>): Promise<void> {
  const { error } = await supabase
    .from("links" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteLink(id: string): Promise<void> {
  const { error } = await supabase
    .from("links" as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteMany(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from("links" as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .in("id", ids);
  if (error) throw error;
}

export async function restoreLink(id: string): Promise<void> {
  const { error } = await supabase
    .from("links" as never)
    .update({ deleted_at: null } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function permanentlyDelete(id: string): Promise<void> {
  const { error } = await supabase.from("links" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function emptyTrash(): Promise<void> {
  const { error } = await supabase
    .from("links" as never)
    .delete()
    .not("deleted_at", "is", null);
  if (error) throw error;
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  await updateLink(id, { pinned } as Partial<LinkRow>);
}

export async function retryAnalysis(id: string): Promise<void> {
  await updateLink(id, { status: "pending", error_message: null } as Partial<LinkRow>);
  // demo: flip back to ready in a moment
  setTimeout(() => {
    updateLink(id, { status: "ready", fetched_at: new Date().toISOString() } as Partial<LinkRow>);
  }, 1500);
}

export async function bulkAddTag(ids: string[], tag: string): Promise<void> {
  // fetch existing tags then merge
  const { data, error } = await supabase
    .from("links" as never)
    .select("id, tags")
    .in("id", ids);
  if (error) throw error;
  const updates = (data as { id: string; tags: string[] }[]).map((row) => ({
    id: row.id,
    tags: Array.from(new Set([...(row.tags || []), tag])),
  }));
  for (const u of updates) {
    await supabase
      .from("links" as never)
      .update({ tags: u.tags } as never)
      .eq("id", u.id);
  }
}
