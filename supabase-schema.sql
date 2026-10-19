-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guestbook_messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

-- NOT VALID keeps old rows untouched while enforcing the limit on new messages.
alter table public.guestbook_messages
  drop constraint if exists guestbook_content_length;
alter table public.guestbook_messages
  add constraint guestbook_content_length
  check (char_length(trim(content)) between 1 and 500) not valid;

alter table public.diary_entries enable row level security;
alter table public.guestbook_messages enable row level security;

drop policy if exists public_read_diary on public.diary_entries;
create policy public_read_diary
on public.diary_entries
for select
using (true);

drop policy if exists admin_insert_diary on public.diary_entries;
create policy admin_insert_diary
on public.diary_entries
for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'mzyshen@gmail.com');

drop policy if exists admin_update_diary on public.diary_entries;
create policy admin_update_diary
on public.diary_entries
for update
to authenticated
using ((auth.jwt() ->> 'email') = 'mzyshen@gmail.com')
with check ((auth.jwt() ->> 'email') = 'mzyshen@gmail.com');

drop policy if exists admin_delete_diary on public.diary_entries;
create policy admin_delete_diary
on public.diary_entries
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'mzyshen@gmail.com');

drop policy if exists public_read_guestbook on public.guestbook_messages;
create policy public_read_guestbook
on public.guestbook_messages
for select
using (true);

drop policy if exists public_insert_guestbook on public.guestbook_messages;

-- The Worker verifies Turnstile before using its server-only secret key.
-- Remove direct browser inserts even if an older project granted table privileges.
revoke insert on public.guestbook_messages from anon, authenticated;
grant insert on public.guestbook_messages to service_role;

