-- Organizational Chart: allow every teacher type the Add Staff form offers.
-- The old check rejected "ALIVE" and "SNED", so saving those teachers failed with
-- 'violates check constraint "org_chart_teaching_type_check"'.
-- Run once in the shared Supabase project's SQL Editor.

alter table public.org_chart drop constraint if exists org_chart_teaching_type_check;

alter table public.org_chart add constraint org_chart_teaching_type_check
  check (
    teaching_type is null
    or teaching_type in ('Adviser', 'Subject Teacher', 'ALS', 'ALIVE', 'SNED')
  );
