-- Adds a per-photo focal point to homepage_slides so the admin portal can
-- adjust which part of an uploaded photo stays centered in the hero banner
-- crop (like Facebook's cover photo reposition). Run once, after
-- supabase-homepage-slides.sql, in the shared Supabase project's SQL Editor.

alter table public.homepage_slides
  add column if not exists focal_x numeric not null default 50 check (focal_x >= 0 and focal_x <= 100),
  add column if not exists focal_y numeric not null default 50 check (focal_y >= 0 and focal_y <= 100);
