-- Per-user preferences. One row per user, created lazily on first save; reads
-- fall back to app defaults when absent. Currency is the first preference: the
-- review screen no longer edits currency per-invoice — each user picks one
-- default currency here and every new invoice is stamped with it at creation.
create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  default_currency text not null default 'ZAR',
  updated_at       timestamptz not null default now()
);

alter table user_settings enable row level security;

-- same owner-scoped policy as every other tenant table (migration 0006)
drop policy if exists "owner_all" on user_settings;
create policy "owner_all" on user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
