-- School Bulletin shared with Project Rising.
-- Run once in the shared Supabase project's SQL Editor.

create table if not exists public.bulletin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  summary text check (summary is null or char_length(summary) <= 500),
  body text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  is_published boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  attachment_url text,
  attachment_name text,
  attachment_storage_path text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add attachment fields when the bulletin table was created by an earlier migration.
alter table public.bulletin_announcements
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_storage_path text;

create index if not exists bulletin_announcements_public_idx
  on public.bulletin_announcements (is_published, published_at desc);

alter table public.bulletin_announcements enable row level security;

drop policy if exists "public read active bulletin announcements" on public.bulletin_announcements;
create policy "public read active bulletin announcements"
  on public.bulletin_announcements for select to anon
  using (is_published = true and (expires_at is null or expires_at >= now()));

-- These policies are additive: policies belonging to another IECES admin app
-- remain in place, while registered ieces-admin-portal users receive manager access.
drop policy if exists "report users read bulletin announcements" on public.bulletin_announcements;
create policy "report users read bulletin announcements"
  on public.bulletin_announcements for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users create bulletin announcements" on public.bulletin_announcements;
create policy "report users create bulletin announcements"
  on public.bulletin_announcements for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users update bulletin announcements" on public.bulletin_announcements;
create policy "report users update bulletin announcements"
  on public.bulletin_announcements for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users delete bulletin announcements" on public.bulletin_announcements;
create policy "report users delete bulletin announcements"
  on public.bulletin_announcements for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

grant select on public.bulletin_announcements to anon;
grant select, insert, update, delete on public.bulletin_announcements to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('bulletin-files', 'bulletin-files', true, 26214400)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "public reads bulletin files" on storage.objects;
create policy "public reads bulletin files"
  on storage.objects for select to public
  using (bucket_id = 'bulletin-files');

drop policy if exists "report users upload bulletin files" on storage.objects;
create policy "report users upload bulletin files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bulletin-files'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  );

drop policy if exists "report users update bulletin files" on storage.objects;
create policy "report users update bulletin files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bulletin-files'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  )
  with check (
    bucket_id = 'bulletin-files'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  );

drop policy if exists "report users delete bulletin files" on storage.objects;
create policy "report users delete bulletin files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bulletin-files'
    and exists (select 1 from public.profiles where profiles.id = auth.uid())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bulletin_announcements'
  ) then
    alter publication supabase_realtime add table public.bulletin_announcements;
  end if;
end $$;
