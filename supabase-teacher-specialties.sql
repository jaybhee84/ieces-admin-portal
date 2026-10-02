-- Subject groups for Teaching Load: which teachers specialize in which subject.
-- "Suggest schedule" gives a subject to its group's teachers in the grades where teachers change per subject.
-- Run once in the shared Supabase project's SQL Editor.

create table if not exists public.teacher_specialties (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null,              -- org_chart.id of the teacher
  subject text not null check (char_length(trim(subject)) between 1 and 120),
  created_by text,
  created_at timestamptz not null default now(),
  unique (teacher_id, subject)
);

create index if not exists teacher_specialties_subject_idx
  on public.teacher_specialties (subject);

alter table public.teacher_specialties enable row level security;

drop policy if exists "report users read teacher specialties" on public.teacher_specialties;
create policy "report users read teacher specialties"
  on public.teacher_specialties for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users create teacher specialties" on public.teacher_specialties;
create policy "report users create teacher specialties"
  on public.teacher_specialties for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

drop policy if exists "report users delete teacher specialties" on public.teacher_specialties;
create policy "report users delete teacher specialties"
  on public.teacher_specialties for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()));

grant select, insert, delete on public.teacher_specialties to authenticated;
