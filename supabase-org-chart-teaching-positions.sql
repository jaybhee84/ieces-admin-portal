-- Organizational Chart: allow the Special Education Teacher (SPET) and Head Teacher positions in the Add Staff form.
-- Only needed if saving one of them fails with
-- 'violates check constraint "org_chart_teaching_position_check"'.
-- It replaces that check when the table has one, and does nothing when it has none.
-- Run in the shared Supabase project's SQL Editor.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'org_chart_teaching_position_check' and conrelid = 'public.org_chart'::regclass
  ) then
    alter table public.org_chart drop constraint org_chart_teaching_position_check;
    alter table public.org_chart add constraint org_chart_teaching_position_check
      check (
        teaching_position is null
        or teaching_position in (
          'Teacher I', 'Teacher II', 'Teacher III', 'Teacher IV', 'Teacher V', 'Teacher VI', 'Teacher VII',
          'Master Teacher I', 'Master Teacher II', 'Master Teacher III', 'Master Teacher IV', 'Master Teacher V',
          'Special Education Teacher I', 'Special Education Teacher II', 'Special Education Teacher III',
          'Special Education Teacher IV', 'Special Education Teacher V',
          'Head Teacher I', 'Head Teacher II', 'Head Teacher III', 'Head Teacher IV', 'Head Teacher V', 'Head Teacher VI'
        )
      );
  end if;
end $$;
