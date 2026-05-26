-- Bilingual link metadata + key points
--
-- Adds Bangla counterparts for title/summary and a structured `key_points`
-- field that powers the new hover preview / detail-panel highlights.
--
-- Old rows keep NULL/empty values; the UI falls back gracefully to the
-- existing English `title` / `summary` columns when the new fields are
-- missing. New saves (and per-link "Re-analyze") populate them.

alter table public.links
  add column if not exists title_bn text,
  add column if not exists summary_bn text,
  add column if not exists key_points jsonb not null default '[]'::jsonb;

comment on column public.links.title_bn is
  'Bangla version of title. Technical/proper nouns stay in English.';
comment on column public.links.summary_bn is
  'Bangla version of summary (3–5 sentences). Technical terms stay in English.';
comment on column public.links.key_points is
  'AI-generated short bullet highlights (English), 3–5 items. Empty array if not generated.';
