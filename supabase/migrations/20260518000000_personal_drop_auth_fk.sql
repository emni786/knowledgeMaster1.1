-- PERSONAL Supabase ONLY — run this migration on your PERSONAL project.
--
-- Problem: The admin user's data is routed to PERSONAL Supabase via the
-- service-role client, but auth.users on PERSONAL is empty (all auth happens
-- on PUBLIC). The FK constraints referencing auth.users(id) therefore fail
-- whenever the admin inserts a link, collection, or analytics event.
--
-- Fix: Drop the auth.users FK constraints on data tables. The owner_id
-- column is still present and scoped manually by server functions; we just
-- remove the referential integrity check to auth.users on PERSONAL.
--
-- NOTE: Do NOT run this on PUBLIC Supabase — keep the FK there for data
-- integrity of regular users.

-- Links
alter table if exists public.links
  drop constraint if exists links_owner_id_fkey;

-- Collections
alter table if exists public.collections
  drop constraint if exists collections_owner_id_fkey;

-- Analytics events
alter table if exists public.analytics_events
  drop constraint if exists analytics_events_owner_id_fkey;
