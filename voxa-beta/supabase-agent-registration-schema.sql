-- Voxa Agent Registration Schema
-- Safe, additive, and idempotent. This creates the future external-agent
-- registration table without changing room_participants, Nova's manifest, or
-- the current compatibility behavior where Nova uses room_participants.user_id = 'nova'.

-- 1. Create the agents table if it does not exist.
-- This table is a review queue for future developer-owned agents. Records here
-- do not appear in Voxa rooms or the Agent Selector until a later DB-backed
-- registry integration is intentionally implemented.
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  avatar_url text,
  creator_user_id uuid not null,
  creator_wallet_address text,
  endpoint_url text,
  status text not null default 'pending_review',
  visibility text not null default 'private',
  capabilities text[] not null default '{}'::text[],
  permissions text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add any missing columns safely if the table already existed.
-- These ADD COLUMN IF NOT EXISTS statements preserve existing data and only
-- expand the table shape.
alter table public.agents add column if not exists slug text;
alter table public.agents add column if not exists name text;
alter table public.agents add column if not exists description text not null default '';
alter table public.agents add column if not exists avatar_url text;
alter table public.agents add column if not exists creator_user_id uuid;
alter table public.agents add column if not exists creator_wallet_address text;
alter table public.agents add column if not exists endpoint_url text;
alter table public.agents add column if not exists status text not null default 'pending_review';
alter table public.agents add column if not exists visibility text not null default 'private';
alter table public.agents add column if not exists capabilities text[] not null default '{}'::text[];
alter table public.agents add column if not exists permissions text[] not null default '{}'::text[];
alter table public.agents add column if not exists tags text[] not null default '{}'::text[];
alter table public.agents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.agents add column if not exists created_at timestamptz not null default now();
alter table public.agents add column if not exists updated_at timestamptz not null default now();

-- 3. Add non-destructive indexes.
-- The unique slug index prevents duplicate developer-facing handles. If an
-- existing agents table already contains duplicate slugs, this statement will
-- fail rather than delete or rewrite data.
create unique index if not exists agents_slug_unique_idx on public.agents (slug);
create index if not exists agents_creator_user_id_idx on public.agents (creator_user_id);
create index if not exists agents_status_idx on public.agents (status);
create index if not exists agents_visibility_idx on public.agents (visibility);
create index if not exists agents_created_at_idx on public.agents (created_at desc);

-- 4. Enable RLS for the future registry table.
-- The current Next.js API routes use a Supabase anon client with the user's
-- bearer token, so these policies are the access-control boundary.
alter table public.agents enable row level security;

-- 5. Allow authenticated developers to create their own draft/pending-review agents.
-- Public visibility and approved statuses are intentionally not self-service.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agents'
      and policyname = 'Voxa agents insert own draft or pending review'
  ) then
    create policy "Voxa agents insert own draft or pending review"
      on public.agents for insert
      to authenticated
      with check (
        creator_user_id = auth.uid()
        and status in ('draft', 'pending_review')
        and visibility in ('private', 'unlisted')
      );
  end if;
end $$;

-- 6. Allow authenticated users to read their own submitted agents.
-- Approved public/unlisted agent reads are included for the future marketplace
-- path, but external agents are not surfaced by the app today.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agents'
      and policyname = 'Voxa agents select own or approved visible'
  ) then
    create policy "Voxa agents select own or approved visible"
      on public.agents for select
      to authenticated
      using (
        creator_user_id = auth.uid()
        or (
          status = 'approved'
          and visibility in ('public', 'unlisted')
        )
      );
  end if;
end $$;

-- 7. Allow developers to update only their own draft/pending-review records.
-- They cannot self-approve, publish public listings, or edit disabled/rejected
-- records through the client-facing routes.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agents'
      and policyname = 'Voxa agents update own editable records'
  ) then
    create policy "Voxa agents update own editable records"
      on public.agents for update
      to authenticated
      using (
        creator_user_id = auth.uid()
        and status in ('draft', 'pending_review')
      )
      with check (
        creator_user_id = auth.uid()
        and status in ('draft', 'pending_review')
        and visibility in ('private', 'unlisted')
      );
  end if;
end $$;
