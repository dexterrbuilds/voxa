-- Voxa Developer Profiles Schema
-- Safe, additive, and idempotent. Public profile pages expose only sanitized
-- fields through server-side query helpers; never expose emails or auth ids.

-- 1. Create one editable public profile per authenticated developer.
create table if not exists public.developer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  website text,
  x_handle text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add missing columns safely if this table already exists.
alter table public.developer_profiles add column if not exists username text;
alter table public.developer_profiles add column if not exists display_name text;
alter table public.developer_profiles add column if not exists bio text not null default '';
alter table public.developer_profiles add column if not exists avatar_url text;
alter table public.developer_profiles add column if not exists website text;
alter table public.developer_profiles add column if not exists x_handle text;
alter table public.developer_profiles add column if not exists joined_at timestamptz not null default now();
alter table public.developer_profiles add column if not exists updated_at timestamptz not null default now();

-- 3. Keep usernames globally unique and efficient to resolve.
create unique index if not exists developer_profiles_username_key
  on public.developer_profiles (username);

create index if not exists developer_profiles_joined_at_idx
  on public.developer_profiles (joined_at desc);

-- 4. Add a username format check for new/updated rows. NOT VALID avoids
-- blocking deployment if legacy rows already exist and need manual cleanup.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'developer_profiles_username_format'
      and conrelid = 'public.developer_profiles'::regclass
  ) then
    alter table public.developer_profiles
      add constraint developer_profiles_username_format
      check (username ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$') not valid;
  end if;
end $$;

-- 5. Enable RLS. Developers may manage only their own profile. Public pages use
-- a server-side service-role query layer that strips unsafe fields.
alter table public.developer_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'developer_profiles'
      and policyname = 'Voxa profiles select own profile'
  ) then
    create policy "Voxa profiles select own profile"
      on public.developer_profiles for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'developer_profiles'
      and policyname = 'Voxa profiles insert own profile'
  ) then
    create policy "Voxa profiles insert own profile"
      on public.developer_profiles for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'developer_profiles'
      and policyname = 'Voxa profiles update own profile'
  ) then
    create policy "Voxa profiles update own profile"
      on public.developer_profiles for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
