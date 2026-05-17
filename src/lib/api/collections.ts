// Frontend API for collections. All reads/writes go through server functions
// so they're routed to the right Supabase project (PERSONAL for admin,
// PUBLIC otherwise).

import type { CollectionRow } from "@/lib/types";
import {
  listCollections,
  createCollectionServer,
  deleteCollectionServer,
  renameCollectionServer,
  setCollectionPublicServer,
  fetchCollectionLinkIdsServer,
  addLinksToCollectionServer,
} from "@/lib/collections.functions";

export async function fetchCollections(): Promise<CollectionRow[]> {
  const rows = await listCollections();
  return rows as unknown as CollectionRow[];
}

export async function createCollection(name: string): Promise<CollectionRow> {
  const row = await createCollectionServer({ data: { name } });
  return row as unknown as CollectionRow;
}

export async function deleteCollection(id: string): Promise<void> {
  await deleteCollectionServer({ data: { id } });
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await renameCollectionServer({ data: { id, name } });
}

export async function setCollectionPublic(id: string, is_public: boolean): Promise<void> {
  await setCollectionPublicServer({ data: { id, is_public } });
}

export async function fetchCollectionLinkIds(collectionId: string): Promise<string[]> {
  return fetchCollectionLinkIdsServer({ data: { collectionId } });
}

export async function addLinksToCollection(collectionId: string, linkIds: string[]): Promise<void> {
  if (!linkIds.length) return;
  await addLinksToCollectionServer({ data: { collectionId, linkIds } });
}
