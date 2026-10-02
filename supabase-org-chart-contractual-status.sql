-- Organizational Chart: allow the "contractual" staff status next to alive (regular) and substitute.
-- Run once in the shared Supabase project's SQL Editor.

alter table public.org_chart
  drop constraint if exists org_chart_status_check;

alter table public.org_chart
  add constraint org_chart_status_check
  check (status in ('alive', 'substitute', 'contractual'));
