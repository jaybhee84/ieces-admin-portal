-- Homepage slideshow photos, managed from the IECES Admin Portal
-- and displayed on the Project Rising public website homepage.
-- Run once in the shared Supabase project's SQL Editor.

create table if not exists public.homepage_slides (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists homepage_slides_order_idx
  on public.homepage_slides (sort_order, created_at);

alter table public.homepage_slides enable row level security;

drop policy if exists "public read homepage slides" on public.homepage_slides;
create policy "public read homepage slides"
  on public.homepage_slides for select
  to anon
  using (true);

drop policy if exists "authenticated manage homepage slides" on public.homepage_slides;
create policy "authenticated manage homepage slides"
  on public.homepage_slides for all
  to authenticated
  using (true)
  with check (true);

grant select on public.homepage_slides to anon;
grant select, insert, update, delete on public.homepage_slides to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('homepage-photos', 'homepage-photos', true, 15728640)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "public reads homepage photos" on storage.objects;
create policy "public reads homepage photos"
  on storage.objects for select to public
  using (bucket_id = 'homepage-photos');

drop policy if exists "authenticated upload homepage photos" on storage.objects;
create policy "authenticated upload homepage photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'homepage-photos');

drop policy if exists "authenticated update homepage photos" on storage.objects;
create policy "authenticated update homepage photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'homepage-photos')
  with check (bucket_id = 'homepage-photos');

drop policy if exists "authenticated delete homepage photos" on storage.objects;
create policy "authenticated delete homepage photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'homepage-photos');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'homepage_slides'
  ) then
    alter publication supabase_realtime add table public.homepage_slides;
  end if;
end $$;
