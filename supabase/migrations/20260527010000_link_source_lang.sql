-- Track the source language of a link's content so the UI can default to
-- showing the *original* language instead of always preferring the user's
-- global EN/BN toggle.
--
-- * `source_lang` : 'en' | 'bn'. Detected by the AI analyzer from the page
--                   body and OG metadata. Old rows default to 'en' so the
--                   UI keeps its previous behaviour for anything saved
--                   before this column existed.
--
-- The frontend uses this column to pick which of (title / title_bn) and
-- (summary / summary_bn) is the "primary" version: when the column is
-- 'bn', the Bangla fields are the canonical content and the English ones
-- (if present) are a translation, and vice versa.

alter table public.links
  add column if not exists source_lang text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'links_source_lang_check'
  ) then
    alter table public.links
      add constraint links_source_lang_check check (source_lang in ('en', 'bn'));
  end if;
end $$;

comment on column public.links.source_lang is
  'Detected source language of the link content: ''en'' (default) or ''bn''. Drives default-language behavior in the UI.';
