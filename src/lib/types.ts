export type ContentType = "article" | "video" | "repo" | "docs" | "tool" | "thread" | "other";
export type LinkStatus = "pending" | "ready" | "failed";
export type LinkSource = "manual" | "telegram" | "import";
export type SourceLang = "en" | "bn";

export interface LinkRow {
  id: string;
  owner_id: string;
  url: string;
  normalized_url: string | null;
  domain: string | null;
  title: string | null;
  title_bn: string | null;
  summary: string | null;
  summary_bn: string | null;
  key_points: string[];
  content_type: ContentType;
  status: LinkStatus;
  tags: string[];
  pinned: boolean;
  // Detected source language of the link content. Drives the UI's default
  // language pick: when set to 'bn' we show the Bangla fields by default
  // and treat the English ones as an optional translation, and vice versa.
  source_lang: SourceLang;
  // Importance (0 = none, 1–3 = ★ ★★ ★★★). Persisted, surfaced on cards
  // and the detail panel; users can also filter by minimum stars.
  priority: number;
  // Read tracking. `null` = unread; otherwise the timestamp the user marked
  // it as read. A subtle dot on the card highlights unread items.
  read_at: string | null;
  // Optional "remind me to read this" timestamp. When non-null and in the
  // past, the in-app reminder watcher surfaces a toast/notification on
  // next render so the link doesn't get forgotten in the pile.
  reminder_at: string | null;
  source: LinkSource;
  error_message: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CollectionRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  is_public: boolean;
  share_token: string | null;
  created_at: string;
}

export interface FilterState {
  query: string;
  contentType: "all" | ContentType;
  status: "all" | LinkStatus;
  sort: "newest" | "oldest" | "title-asc" | "title-desc" | "domain-asc";
  pinnedOnly: boolean;
  showDeleted: boolean;
  showDuplicates: boolean;
  collectionId: string | null;
  // 0 = no filter, 1–3 = only links with at least N stars.
  minPriority: 0 | 1 | 2 | 3;
  // "all" = no read filter; "read" / "unread" narrows the visible set.
  readState: "all" | "read" | "unread";
}

export const DEFAULT_FILTERS: FilterState = {
  query: "",
  contentType: "all",
  status: "all",
  sort: "newest",
  pinnedOnly: false,
  showDeleted: false,
  showDuplicates: false,
  collectionId: null,
  minPriority: 0,
  readState: "all",
};
