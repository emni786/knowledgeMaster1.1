-- User management: a SECURITY DEFINER RPC the admin UI calls (via the
-- service-role client, server-side) to list every user with their email and
-- admin flag. Reading auth.users requires elevated privileges, so we wrap
-- the join + ordering in a function. Granted-admin enforcement happens in
-- the server function before calling this — RLS / role checks here are
-- defence in depth: only the service_role role can execute it.

create or replace function public.get_all_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    au.id,
    au.email::text as email,
    au.created_at,
    coalesce(p.is_admin, false) as is_admin
  from auth.users au
  left join public.profiles p on p.id = au.id
  order by au.created_at desc;
end;
$$;

-- Lock the function down: only the service-role client (used server-side
-- via SUPABASE_SERVICE_ROLE_KEY) may call it. End-user JWTs (anon /
-- authenticated) get no access, so the admin UI must always invoke this
-- via the server function helper that uses `publicAdmin`.
revoke execute on function public.get_all_users() from public, anon, authenticated;
grant execute on function public.get_all_users() to service_role;
