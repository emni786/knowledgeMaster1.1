-- Importance, read tracking, and reminder for saved links.
--
-- * `priority`    : 0 = no star, 1 = ★, 2 = ★★, 3 = ★★★. Lets users flag
--                   what matters; UI filters and sorts on this.
-- * `read_at`     : NULL while the user hasn't opened/marked the link as
--                   read. Set to a timestamptz when they do; cleared back
--                   to NULL when they "mark unread".
-- * `reminder_at` : optional future timestamp. The frontend surfaces due
--                   reminders the next time the user is on the library so
--                   "read later" links don't rot.
--
-- All three default to safe values so existing rows keep working: every
-- old link is treated as unread, unrated, and without a reminder.

alter table public.links
  add column if not exists priority smallint not null default 0,
  add column if not exists read_at timestamptz,
  add column if not exists reminder_at timestamptz;

-- Constrain priority to 0..3 so a bad client can't write 9000.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'links_priority_range'
  ) then
    alter table public.links
      add constraint links_priority_range check (priority between 0 and 3);
  end if;
end $$;

comment on column public.links.priority is
  'User-assigned importance, 0 (none) to 3 (highest).';
comment on column public.links.read_at is
  'When the user marked this link as read. NULL means unread.';
comment on column public.links.reminder_at is
  'Optional reminder timestamp. UI surfaces due reminders to the user.';

-- Indexes for the two most common filtered views.
create index if not exists links_unread_idx
  on public.links (owner_id)
  where read_at is null and deleted_at is null;

create index if not exists links_reminder_due_idx
  on public.links (owner_id, reminder_at)
  where reminder_at is not null and deleted_at is null;
