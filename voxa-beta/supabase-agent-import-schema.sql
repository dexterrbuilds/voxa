-- Voxa Agent Import Schema (Bring Your Own Agent / self-import)
-- Safe, additive, idempotent. Adds descriptive import provenance to public.agents.
--
-- This does NOT change review, verification, sandbox, permissions, room access, or
-- RLS. Imported agents go through the SAME review + verification pipeline as any
-- other external agent — import source is metadata only and never grants trust.

-- import_source: where the agent originates. Defaults to 'custom_endpoint'
-- (a directly-built Voxa SDK endpoint). Other values (openclaw, langchain,
-- crewai, autogen, other) indicate an existing runtime wrapped behind a
-- Voxa-compatible adapter endpoint.
alter table public.agents
  add column if not exists import_source text not null default 'custom_endpoint';

-- import_metadata: optional, developer-supplied provenance (e.g. repository URL,
-- docs URL). Internal — never exposed publicly. No endpoint secrets belong here.
alter table public.agents
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

-- Optional index for filtering by import source in admin/analytics tooling.
create index if not exists agents_import_source_idx on public.agents (import_source);
