
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.rss_feeds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  site_url TEXT,
  domain TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  items_imported INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, url)
);

ALTER TABLE public.rss_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rss_feeds owner all"
ON public.rss_feeds FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_rss_feeds_owner ON public.rss_feeds(owner_id);

CREATE TRIGGER trg_rss_feeds_updated_at
BEFORE UPDATE ON public.rss_feeds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
