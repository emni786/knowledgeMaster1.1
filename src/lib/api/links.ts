// Frontend API for links. All reads/writes go through server functions so
// they get routed to the right Supabase project (PERSONAL for admin,
// PUBLIC otherwise). The frontend never talks to a data DB directly.

import type { LinkRow } from "@/lib/types";
import {
  saveLinksPending,
  analyzeLinks,
  reanalyzeLink,
  listLinks,
  updateLinkServer,
  softDeleteLinkServer,
  softDeleteManyLinksServer,
  restoreLinkServer,
  restoreManyLinksServer,
  permanentlyDeleteLinkServer,
  permanentlyDeleteManyLinksServer,
  emptyTrashServer,
  bulkAddTagServer,
} from "@/lib/links.functions";

export async function fetchLinks(): Promise<LinkRow[]> {
  const rows = await listLinks();
  return rows as unknown as LinkRow[];
}

export async function addLinks(urls: string[]): Promise<{ count: number }> {
  const cleaned = urls.map((u) => u.trim()).filter(Boolean);
  if (!cleaned.length) return { count: 0 };
  // Insert pending rows immediately so the Add button stays snappy.
  const { ids, count } = await saveLinksPending({ data: { urls: cleaned } });
  // Kick off AI analysis in the background. We don't await: the row inserts
  // are already visible (via Supabase realtime invalidation) and the analyze
  // request will keep running on the server while the user keeps the tab open;
  // when each row transitions to "ready"/"failed" the realtime push refreshes
  // the UI.
  if (ids.length) {
    void analyzeLinks({ data: { ids } }).catch(() => undefined);
  }
  return { count };
}

export async function updateLink(id: string, patch: Partial<LinkRow>): Promise<void> {
  await updateLinkServer({
    data: { id, patch: patch as Record<string, unknown> },
  });
}

export async function setPriority(id: string, priority: 0 | 1 | 2 | 3): Promise<void> {
  await updateLinkServer({ data: { id, patch: { priority } } });
}

export async function setRead(id: string, read: boolean): Promise<void> {
  await updateLinkServer({
    data: { id, patch: { read_at: read ? new Date().toISOString() : null } },
  });
}

export async function setReminder(id: string, reminderAt: string | null): Promise<void> {
  await updateLinkServer({ data: { id, patch: { reminder_at: reminderAt } } });
}

export async function softDeleteLink(id: string): Promise<void> {
  await softDeleteLinkServer({ data: { id } });
}

export async function softDeleteMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await softDeleteManyLinksServer({ data: { ids } });
}

export async function restoreLink(id: string): Promise<void> {
  await restoreLinkServer({ data: { id } });
}

export async function permanentlyDelete(id: string): Promise<void> {
  await permanentlyDeleteLinkServer({ data: { id } });
}

export async function permanentlyDeleteMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await permanentlyDeleteManyLinksServer({ data: { ids } });
}

export async function restoreMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await restoreManyLinksServer({ data: { ids } });
}

export async function emptyTrash(): Promise<void> {
  await emptyTrashServer();
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  await updateLink(id, { pinned } as Partial<LinkRow>);
}

export async function retryAnalysis(id: string): Promise<void> {
  await reanalyzeLink({ data: { id } });
}

export async function bulkAddTag(ids: string[], tag: string): Promise<void> {
  if (!ids.length || !tag) return;
  await bulkAddTagServer({ data: { ids, tag } });
}
