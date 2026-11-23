-- Kesh website reviews. Run once in Supabase SQL Editor or via Supabase migrations.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  category text not null check (category in ('General experience','Booking process','Website usability','Suggestion')),
  comment text not null check (char_length(btrim(comment)) between 10 and 1000),
  display_name text not null default 'Kesh user' check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
-- Public reviews are readable by anyone; only signed-in users may create their own.
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to anon, authenticated using (true);
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated with check (auth.uid() = user_id);
grant select on public.feedback to anon, authenticated;
grant insert on public.feedback to authenticated;
revoke update, delete on public.feedback from anon, authenticated;
