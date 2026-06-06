-- Voxa Agent Verification Schema (endpoint health check + sandbox readiness)
-- Safe, additive, idempotent. Adds an ORTHOGONAL verification axis to
-- public.agents. This is independent of the review `status` lifecycle
-- (draft/pending_review/approved/rejected/disabled): an agent can be approved by
-- a human reviewer AND still need its endpoint verified before sandbox testing.
--
-- This does NOT make external agents available in live rooms, does NOT change
-- developer RLS, and does NOT touch room_participants or Nova. Verification +
-- approval are prerequisites for the developer SANDBOX only, never production
-- rooms, until a DB-backed runtime registry is intentionally enabled.

-- 1. Verification axis columns.
-- verification_status: 'verification_pending' (default) | 'verified' | 'verification_failed'.
alter table public.agents
  add column if not exists verification_status text not null default 'verification_pending';
alter table public.agents add column if not exists verified_at timestamptz;
alter table public.agents add column if not exists verification_note text;
-- Stored health-check report (endpoint reachability, SDK compatibility, capability payload).
alter table public.agents
  add column if not exists verification_report jsonb not null default '{}'::jsonb;

-- 2. Index for verification queue lookups.
create index if not exists agents_verification_status_idx
  on public.agents (verification_status);

-- Note: the verification health check and writes run through the admin API using
-- the Supabase SERVICE ROLE key (server-only), which bypasses RLS. No additional
-- RLS policy is required or added here. Developers can read their own agents'
-- verification_status through the existing owner-scoped select policy.
