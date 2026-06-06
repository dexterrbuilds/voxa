-- Voxa Agent Review Schema (admin review tooling)
-- Safe, additive, idempotent. Extends public.agents with review audit columns.
-- This does NOT change room_participants, Nova's manifest, RLS for developers,
-- or make approved agents available in live rooms. Approval here is review-only
-- until a DB-backed runtime registry is intentionally enabled.

-- 1. Add review audit columns if they do not exist.
-- These preserve existing data and only expand the table shape.
alter table public.agents add column if not exists reviewed_by uuid;
alter table public.agents add column if not exists reviewed_at timestamptz;
alter table public.agents add column if not exists review_note text;

-- 2. Helpful index for the admin review queue (most recently updated first).
create index if not exists agents_status_updated_at_idx
  on public.agents (status, updated_at desc);

-- Note: admin review API routes use the Supabase SERVICE ROLE key (server-only),
-- which bypasses RLS. No additional RLS policy is required for admins, and none is
-- added here so developer-facing policies remain unchanged. Admin authorization is
-- enforced in the Next.js routes via the ADMIN_EMAILS allowlist before any
-- service-role query runs.
