-- ============================================================
-- MMA BRIDGE — Supabase database schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Ratings / reviews ─────────────────────────────────────────
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  event_id    text not null,
  event_name  text,
  hype_rating numeric(3,1) check (hype_rating >= 0.5 and hype_rating <= 5),
  review_text text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, event_id)
);

-- ── Review likes ──────────────────────────────────────────────
create table if not exists public.review_likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  rating_id  uuid references public.ratings(id)  on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, rating_id)
);

-- ── Replies to reviews ────────────────────────────────────────
create table if not exists public.review_replies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  rating_id  uuid references public.ratings(id)  on delete cascade not null,
  text       text not null,
  created_at timestamptz default now()
);

-- ── Reply likes ───────────────────────────────────────────────
create table if not exists public.reply_likes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id)       on delete cascade not null,
  reply_id   uuid references public.review_replies(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, reply_id)
);

-- ── Row-Level Security ────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.ratings        enable row level security;
alter table public.review_likes   enable row level security;
alter table public.review_replies enable row level security;
alter table public.reply_likes    enable row level security;

-- Profiles
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Ratings
create policy "ratings_select" on public.ratings for select using (true);
create policy "ratings_insert" on public.ratings for insert with check (auth.uid() = user_id);
create policy "ratings_update" on public.ratings for update using (auth.uid() = user_id);
create policy "ratings_delete" on public.ratings for delete using (auth.uid() = user_id);

-- Review likes
create policy "review_likes_select" on public.review_likes for select using (true);
create policy "review_likes_insert" on public.review_likes for insert with check (auth.uid() = user_id);
create policy "review_likes_delete" on public.review_likes for delete using (auth.uid() = user_id);

-- Replies
create policy "replies_select" on public.review_replies for select using (true);
create policy "replies_insert" on public.review_replies for insert with check (auth.uid() = user_id);
create policy "replies_delete" on public.review_replies for delete using (auth.uid() = user_id);

-- Reply likes
create policy "reply_likes_select" on public.reply_likes for select using (true);
create policy "reply_likes_insert" on public.reply_likes for insert with check (auth.uid() = user_id);
create policy "reply_likes_delete" on public.reply_likes for delete using (auth.uid() = user_id);

-- ── Fight comments (per-fight discussion threads) ────────────
-- Fight comments (per-fight discussion threads)
CREATE TABLE IF NOT EXISTS fight_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  fight_key text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 500),
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS fight_comments_event_fight ON fight_comments(event_id, fight_key);
ALTER TABLE fight_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Anyone can read fight comments" ON fight_comments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Auth users can insert" ON fight_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can delete own comments" ON fight_comments FOR DELETE USING (auth.uid() = user_id);
