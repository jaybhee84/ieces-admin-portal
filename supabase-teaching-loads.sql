-- Teaching Load (class scheduling for the eSF7 Daily Program).
-- Run once in the shared Supabase project's SQL Editor.

create table if not exists public.teaching_loads (
  id uuid primary key default gen_random_uuid(),
  school_year text not null,
  teacher_id text not null,              -- org_chart.id of the teacher
  load_type text not null default 'teaching' check (load_type in ('teaching', 'advisory', 'ancillary')),
  subject text not null check (char_length(trim(subject)) between 1 and 120),
  grade_level text,
  section text,
  days text[] not null default '{M,T,W,TH,F}',
  time_start time not null,
  time_end time not null,
  remarks text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (time_end > time_start)
);

create index if not exists teaching_loads_sy_teacher_idx
  on public.teaching_loads (school_year, teacher_id);

alter table public.teaching_loads enable row level security;

drop policy if exists "report users read teaching loads" on public.teaching_loads;
create policy "report users read teaching loads"
  on public.teaching_loads for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users create teaching loads" on public.teaching_loads;
create policy "report users create teaching loads"
  on public.teaching_loads for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users update teaching loads" on public.teaching_loads;
create policy "report users update teaching loads"
  on public.teaching_loads for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users delete teaching loads" on public.teaching_loads;
create policy "report users delete teaching loads"
  on public.teaching_loads for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

grant select, insert, update, delete on public.teaching_loads to authenticated;
