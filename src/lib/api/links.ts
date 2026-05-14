import { supabase } from "@/integrations/supabase/client";
import type { LinkRow } from "@/lib/types";
import { analyzeAndSaveLinks, reanalyzeLink } from "@/lib/links.functions";

export async function fetchLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from("links" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LinkRow[];
}

export async function addLinks(urls: string[]): Promise<LinkRow[]> {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean);
  if (!cleaned.length) return [];
  await analyzeAndSaveLinks({ data: { urls: cleaned } });
  // Realtime + react-query will refetch; return empty (caller relies on cache).
  return [];
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
  await reanalyzeLink({ data: { id } });
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
