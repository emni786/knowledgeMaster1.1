ALTER TABLE public.telegram_bots
  ADD COLUMN IF NOT EXISTS default_chat_id BIGINT;