create table public.telegram_bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  bot_token text not null,
  bot_username text,
  bot_id bigint,
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index telegram_bots_owner_token on public.telegram_bots(owner_id, bot_token);

alter table public.telegram_bots enable row level security;

create policy "telegram_bots owner all"
on public.telegram_bots for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);