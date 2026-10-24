-- ============================================================================
-- AnimeGate — Phase 2: User data schema (PostgreSQL / Supabase)
-- ============================================================================
-- Tables: profiles, favorites, watch_history, ratings, watchlist, comments
--
-- Conventions
--   - Every user-data table is guarded by Row Level Security (RLS).
--   - `anime_id` is a `bigint` matching AniList's numeric media IDs
--     (the frontend already keys anime by these IDs, e.g. `/anime/:id`).
--   - Auth identity lives in Supabase's `auth.users(id uuid)`. Every table
--     carries a `user_id uuid` that references it.
--   - Row access is governed by the privacy toggles on `profiles`:
--       is_favorites_public  -> who may read your `favorites`
--       is_watchlist_public  -> who may read your `watch_history` + `ratings` + `watchlist`
--     Comment rows are always publicly readable (they display on a shared
--     anime page), but only the author can edit/delete their own.
--
-- Run this script once in the Supabase SQL Editor (or `supabase db execute`).
-- It is largely idempotent: `CREATE ... IF NOT EXISTS` / `DROP ... IF EXISTS`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  avatar_url text,
  bio text,
  is_watchlist_public boolean not null default false,
  is_favorites_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_updated_at
  on public.profiles (updated_at desc);

-- Keep `updated_at` fresh on every change (skip the initial INSERT so we don't
-- double-stamp on signup).
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Auto-create a profile the moment a new auth.user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. favorites
-- ----------------------------------------------------------------------------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  anime_id bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create index if not exists idx_favorites_user on public.favorites (user_id);
create index if not exists idx_favorites_anime on public.favorites (anime_id);

-- ----------------------------------------------------------------------------
-- 3. watch_history
-- ----------------------------------------------------------------------------
create table if not exists public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  anime_id bigint not null,
  episode_number integer,
  watched_at timestamptz not null default now()
);

create index if not exists idx_watch_history_user
  on public.watch_history (user_id, watched_at desc);
create index if not exists idx_watch_history_anime on public.watch_history (anime_id);

-- ----------------------------------------------------------------------------
-- 4. ratings
-- ----------------------------------------------------------------------------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  anime_id bigint not null,
  score integer not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create index if not exists idx_ratings_user on public.ratings (user_id);
create index if not exists idx_ratings_anime on public.ratings (anime_id);

-- ----------------------------------------------------------------------------
-- 5. watchlist  (one row per user/title, carries the tracking status)
-- ----------------------------------------------------------------------------
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  anime_id bigint not null,
  status text not null
    check (status in ('PLAN_TO_WATCH', 'CURRENTLY_WATCHING', 'COMPLETED', 'ON_HOLD', 'DROPPED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create index if not exists idx_watchlist_user on public.watchlist (user_id);
create index if not exists idx_watchlist_anime on public.watchlist (anime_id);

-- Keep `updated_at` fresh on every change (skip the initial INSERT).
create or replace function public.set_watchlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_watchlist_updated_at on public.watchlist;
create trigger trg_watchlist_updated_at
  before update on public.watchlist
  for each row
  execute function public.set_watchlist_updated_at();

-- ----------------------------------------------------------------------------
-- 6. comments
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  anime_id bigint not null,
  episode_number integer, -- nullable: null = general anime comment
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_anime
  on public.comments (anime_id, created_at desc);
create index if not exists idx_comments_user on public.comments (user_id);

-- ============================================================================
-- RLS + policies
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.favorites     enable row level security;
alter table public.watch_history enable row level security;
alter table public.ratings       enable row level security;
alter table public.watchlist     enable row level security;
alter table public.comments      enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
--   * Any authenticated user can read any profile (needed to render names /
--     avatars and to evaluate another user's privacy toggles).
--   * A user owns their row: they can insert (signup backfill) and update it.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select_auth on public.profiles;
drop policy if exists profiles_insert_owner on public.profiles;
drop policy if exists profiles_update_owner on public.profiles;

create policy profiles_select_auth on public.profiles
  for select to authenticated
  using (true);

create policy profiles_insert_owner on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- favorites  (reading others' rows gated by is_favorites_public)
-- ----------------------------------------------------------------------------
drop policy if exists favorites_select on public.favorites;
drop policy if exists favorites_insert on public.favorites;
drop policy if exists favorites_delete on public.favorites;

create policy favorites_select on public.favorites
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.is_favorites_public
    )
  );

create policy favorites_insert on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

create policy favorites_delete on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- watch_history  (reading others' rows gated by is_watchlist_public)
-- ----------------------------------------------------------------------------
drop policy if exists watch_history_select on public.watch_history;
drop policy if exists watch_history_insert on public.watch_history;
drop policy if exists watch_history_delete on public.watch_history;

create policy watch_history_select on public.watch_history
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.is_watchlist_public
    )
  );

create policy watch_history_insert on public.watch_history
  for insert to authenticated
  with check (user_id = auth.uid());

create policy watch_history_delete on public.watch_history
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ratings  (reading others' rows gated by is_watchlist_public; one row per user/title)
-- ----------------------------------------------------------------------------
drop policy if exists ratings_select on public.ratings;
drop policy if exists ratings_insert on public.ratings;
drop policy if exists ratings_update on public.ratings;
drop policy if exists ratings_delete on public.ratings;

create policy ratings_select on public.ratings
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.is_watchlist_public
    )
  );

create policy ratings_insert on public.ratings
  for insert to authenticated
  with check (user_id = auth.uid());

create policy ratings_update on public.ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy ratings_delete on public.ratings
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- watchlist  (reading others' rows gated by is_watchlist_public; one row per user/title)
-- ----------------------------------------------------------------------------
drop policy if exists watchlist_select on public.watchlist;
drop policy if exists watchlist_insert on public.watchlist;
drop policy if exists watchlist_update on public.watchlist;
drop policy if exists watchlist_delete on public.watchlist;

create policy watchlist_select on public.watchlist
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = user_id and p.is_watchlist_public
    )
  );

create policy watchlist_insert on public.watchlist
  for insert to authenticated
  with check (user_id = auth.uid());

create policy watchlist_update on public.watchlist
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy watchlist_delete on public.watchlist
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- comments  (publicly readable on anime pages; author owns edits/deletes)
-- ----------------------------------------------------------------------------
drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;

create policy comments_select on public.comments
  for select to authenticated
  using (true);

create policy comments_insert on public.comments
  for insert to authenticated
  with check (user_id = auth.uid());

create policy comments_update on public.comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy comments_delete on public.comments
  for delete to authenticated
  using (user_id = auth.uid());