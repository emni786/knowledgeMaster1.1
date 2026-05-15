
-- API tokens for browser extension and other external clients
CREATE TABLE public.api_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Browser extension',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_owner ON public.api_tokens(owner_id);
CREATE INDEX idx_api_tokens_hash ON public.api_tokens(token_hash);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tokens" ON public.api_tokens
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users create own tokens" ON public.api_tokens
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users delete own tokens" ON public.api_tokens
  FOR DELETE USING (auth.uid() = owner_id);
