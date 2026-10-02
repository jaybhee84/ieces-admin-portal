-- Organizational Chart: allow every grade level / assignment the Add Staff form offers.
-- The old check rejected "ALIVE" (and possibly "ALS"), so saving an ALIVE teacher failed with
-- 'violates check constraint "org_chart_grade_level_check"'.
-- Run once in the shared Supabase project's SQL Editor.

alter table public.org_chart drop constraint if exists org_chart_grade_level_check;

-- "SPED" is no longer a valid value: any staff still saved under it are moved to SNED
update public.org_chart set grade_level = 'SNED' where grade_level = 'SPED';

alter table public.org_chart add constraint org_chart_grade_level_check
  check (
    grade_level is null
    or grade_level in (
      'SNED',
      'Kinder',
      'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
      'ALS', 'ALIVE'
    )
  );
