-- Admin tier: an `is_admin` flag on profiles and a singleton `admin_settings`
-- table that holds runtime-configurable values (AI key, public URL, etc.) the
-- deployer can edit from the in-app Settings page instead of editing .env.
--
-- Admin is granted automatically by the server when a user's email matches the
-- ADMIN_EMAIL environment variable (see src/integrations/supabase/auth-middleware.ts).
-- Non-admin users transparently use whatever values the admin has saved.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create table if not exists public.admin_settings (
  id smallint primary key default 1 check (id = 1),
  google_ai_api_key text,
  ai_base_url text,
  ai_model text,
  public_app_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.admin_settings (id) values (1) on conflict (id) do nothing;

alter table public.admin_settings enable row level security;

-- Only admins can read or update admin_settings via the public API.
-- The service-role client bypasses RLS for internal reads (e.g. AI calls).
drop policy if exists "admin_settings select for admins" on public.admin_settings;
create policy "admin_settings select for admins"
  on public.admin_settings
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "admin_settings update for admins" on public.admin_settings;
create policy "admin_settings update for admins"
  on public.admin_settings
  for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Keep updated_at fresh on edits.
create or replace function public.touch_admin_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_admin_settings_updated_at on public.admin_settings;
create trigger touch_admin_settings_updated_at
  before update on public.admin_settings
  for each row execute function public.touch_admin_settings_updated_at();
