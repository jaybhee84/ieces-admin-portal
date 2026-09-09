-- Adds a per-photo zoom level to homepage_slides alongside the existing
-- focal point, so the admin portal's photo adjuster can zoom in on a photo
-- in addition to repositioning it. Run once, after
-- supabase-homepage-slides-focal-point.sql, in the shared Supabase
-- project's SQL Editor.

alter table public.homepage_slides
  add column if not exists zoom numeric not null default 1 check (zoom >= 1 and zoom <= 3);
