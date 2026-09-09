-- IECES news role-based approval workflow
-- Run once in the Supabase SQL Editor for the shared news project.
-- Requires supabase-news-approval.sql to have been applied first.
--
-- Rule: articles submitted by a teacher (or admin) are published immediately.
-- Articles submitted by a student always land in the pending queue, where a
-- teacher or admin can review, edit, and approve/reject them from the Media
-- Manager.

alter table public.news_articles
  add column if not exists author_role text;

-- Best-effort backfill: articles that are already approved were most likely
-- posted by staff; anything still pending/rejected is treated as a student
-- submission so it keeps requiring review.
update public.news_articles
set author_role = case when status = 'approved' then 'teacher' else 'student' end
where author_role is null;

alter table public.news_articles
  alter column author_role set default 'student',
  alter column author_role set not null;

alter table public.news_articles
  drop constraint if exists news_articles_author_role_check;

alter table public.news_articles
  add constraint news_articles_author_role_check
  check (author_role in ('teacher', 'student', 'admin'));

-- Force the status on insert based on who is posting, so the submitting
-- client cannot bypass review by setting status itself.
create or replace function public.set_news_article_initial_status()
returns trigger
language plpgsql
as $$
begin
  if new.author_role in ('teacher', 'admin') then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists news_articles_set_initial_status on public.news_articles;

create trigger news_articles_set_initial_status
  before insert on public.news_articles
  for each row
  execute function public.set_news_article_initial_status();
