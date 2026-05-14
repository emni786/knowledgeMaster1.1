
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles select self or public" on public.profiles for select using (true);
create policy "profiles update self" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert self" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, split_part(new.email, '@', 1) || '-' || substr(new.id::text, 1, 6))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Collections
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  is_public boolean not null default false,
  share_token text unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.collections enable row level security;
create policy "collections owner all" on public.collections for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "collections public read" on public.collections for select using (is_public = true);

-- Links
create table public.links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  normalized_url text,
  domain text,
  title text,
  summary text,
  content_type text not null default 'other' check (content_type in ('article','video','repo','docs','tool','thread','other')),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  source text not null default 'manual' check (source in ('manual','telegram','import')),
  error_message text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.links enable row level security;
create policy "links owner all" on public.links for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create index links_owner_idx on public.links(owner_id, created_at desc);
create index links_status_idx on public.links(owner_id, status);

-- Collection links (junction)
create table public.collection_links (
  collection_id uuid not null references public.collections(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, link_id)
);
alter table public.collection_links enable row level security;
create policy "collection_links owner all" on public.collection_links for all
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = auth.uid()));
create policy "collection_links public read" on public.collection_links for select
  using (exists (select 1 from public.collections c where c.id = collection_id and c.is_public = true));

-- Analytics events
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.analytics_events enable row level security;
create policy "analytics owner all" on public.analytics_events for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Realtime
alter publication supabase_realtime add table public.links;
alter publication supabase_realtime add table public.collections;
