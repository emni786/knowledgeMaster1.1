ALTER TABLE public.links DROP CONSTRAINT links_source_check;
ALTER TABLE public.links ADD CONSTRAINT links_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'telegram'::text, 'import'::text, 'rss'::text]));