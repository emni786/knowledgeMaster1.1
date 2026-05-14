export type ContentType = "article" | "video" | "repo" | "docs" | "tool" | "thread" | "other";
export type LinkStatus = "pending" | "ready" | "failed";
export type LinkSource = "manual" | "telegram" | "import";

export interface LinkRow {
  id: string;
  owner_id: string;
  url: string;
  normalized_url: string | null;
  domain: string | null;
  title: string | null;
  summary: string | null;
  content_type: ContentType;
  status: LinkStatus;
  tags: string[];
  pinned: boolean;
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
};
