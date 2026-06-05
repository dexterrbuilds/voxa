-- Developer SDK beta access requests.
-- Safe, non-destructive setup for collecting /developers/access submissions.

-- Creates the table if it does not exist. Existing data is preserved.
create table if not exists public.developer_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  x_handle text not null,
  agent_idea text not null,
  company text,
  source text not null default 'developers/access',
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Adds useful columns if an older table already exists.
alter table public.developer_access_requests
  add column if not exists company text,
  add column if not exists source text not null default 'developers/access',
  add column if not exists status text not null default 'new',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

-- Fast lookup by email for review and deduping.
create index if not exists developer_access_requests_email_idx
  on public.developer_access_requests (email);

-- Fast newest-first review in Supabase Table Editor.
create index if not exists developer_access_requests_created_at_idx
  on public.developer_access_requests (created_at desc);

-- Keeps duplicate exact email + agent idea submissions from creating repeated rows
-- while preserving different ideas from the same developer.
create unique index if not exists developer_access_requests_email_idea_unique_idx
  on public.developer_access_requests (email, md5(agent_idea));
