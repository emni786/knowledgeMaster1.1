import { supabase } from "@/integrations/supabase/client";
import type { CollectionRow } from "@/lib/types";

export async function fetchCollections(): Promise<CollectionRow[]> {
  const { data, error } = await supabase
    .from("collections" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CollectionRow[];
}

export async function createCollection(name: string): Promise<CollectionRow> {
  const { data: userData } = await supabase.auth.getUser();
  const owner_id = userData.user?.id;
  if (!owner_id) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("collections" as never)
    .insert({ name, owner_id, slug: name.toLowerCase().replace(/\s+/g, "-") } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CollectionRow;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("collections" as never)
    .update({ name } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function setCollectionPublic(id: string, is_public: boolean): Promise<void> {
  const { error } = await supabase
    .from("collections" as never)
    .update({ is_public } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function fetchCollectionLinkIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_links" as never)
    .select("link_id")
    .eq("collection_id", collectionId);
  if (error) throw error;
  return (data as { link_id: string }[]).map((r) => r.link_id);
}

export async function addLinksToCollection(collectionId: string, linkIds: string[]): Promise<void> {
  const rows = linkIds.map((link_id) => ({ collection_id: collectionId, link_id }));
  const { error } = await supabase
    .from("collection_links" as never)
    .upsert(rows as never, { onConflict: "collection_id,link_id" });
  if (error) throw error;
}
