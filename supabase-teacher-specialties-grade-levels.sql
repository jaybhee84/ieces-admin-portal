-- Subject groups for Teaching Load: a teacher may handle their subject in more than one grade level.
-- grade_levels lists the grades (e.g. {"Grade 5","Grade 6"}); empty or null means the teacher's own grade.
-- Run once in the shared Supabase project's SQL Editor, after supabase-teacher-specialties.sql.

alter table public.teacher_specialties
  add column if not exists grade_levels text[];

drop policy if exists "report users update teacher specialties" on public.teacher_specialties;
create policy "report users update teacher specialties"
  on public.teacher_specialties for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid()))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid()));

grant update on public.teacher_specialties to authenticated;
