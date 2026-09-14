# Migration readiness audit

Static review of current repository SQL; **nothing applied in this pass**. Hosted schema may
differ. Idempotent constructs do not prove a hosted database already has matching policies.

## Nova launch order

`supabase-nova-launch.sql` -> `supabase-nova-quotes.sql` -> `supabase-privy-identity.sql`
(all under `synq/`). These require only standard Supabase Auth/roles/UUID support.

- Launch creates three owner tables, guarded owner SELECT policies and service-only turn/
  approval routines. `create table/index if not exists` avoids duplicates; functions replace
  the same signatures. No row deletions. Browser mutations are revoked.
- Quotes replaces the same approval signature, allows review-only quote results and now adds
  service-only `nova_launch_readiness()`. Entire file is transactional. No transactions are built.
- Identity backfills stable legacy UUIDs and pins Privy DID/wallet mappings. It drops/re-adds
  only the three Nova owner FK constraints, not data/tables. Writes/revocations service-only,
  no browser identity policy; legacy signup trigger is replaced by name. Reapplication retains
  existing mappings. Cascades are intentional existing ownership lifecycle semantics, not a
  migration-time delete. Review before deleting any legacy auth/identity account later.
- Reapplying older launch SQL alone would replace the quote approval extension. Reapply in
  full order; do not use old migration files as rollback scripts.
- This pass changes no Nova SELECT policies/hash/nonce/approval logic. Missing table/column/
  routine errors are classified, and a service-only version probe prevents provider work when
  quote schema is missing. No migration is ever run by a route.

## Dormant platform scripts: separate future rollout, not launch prerequisites

| Order/group | File | Review result |
| --- | --- | --- |
| 1 | `supabase-agent-registration-schema.sql` | Creates agents, indexes, guarded policies. Unique slug index can fail on pre-existing duplicates rather than silently delete data. **Historical SELECT policy permits authenticated access to approved public/unlisted rows, including internal columns; audit/narrow before broad platform restoration.** |
| 2 | `supabase-agent-review-schema.sql` | Adds review columns/index; requires agents; no new grants |
| 3 | `supabase-agent-verification-schema.sql` | Adds verification columns/index; requires agents |
| 4 | `supabase-agent-import-schema.sql` | Adds provenance metadata/index; requires agents |
| 5 | `supabase-agent-analytics-schema.sql` | Creates counters/owner SELECT policy; requires agents. Original increment grant alone is not the final security posture |
| 6, immediately after 5 | `supabase-agent-analytics-server-writes.sql` | Replaces increment routine with service-role-only, metric/owner checks; mandatory final hardening |
| Independent | `supabase-developer-profiles-schema.sql` | Requires auth.users; own-user policies, NOT VALID format constraint preserving older rows; duplicate usernames can prevent index creation |
| Independent marketing | `supabase/developer-access-requests.sql` | Preserves waitlist rows and adds indexes. **Does not itself enable RLS/revoke anon access. Do not assume it is private on a fresh Supabase project; harden before enabling this marketing flow** |

Most extensions use ADD COLUMN IF NOT EXISTS, guarded policies and replace-by-signature
functions. Registration/analytics/profile base scripts are not full repair migrations for
arbitrarily drifted schemas. They do not replace an existing permissive same-name policy.
Do not bulk-apply these to an already configured project without comparing deployed policies.
These inherited dormant-surface caveats are not silently fixed or re-enabled by Nova readiness.

Local-only legacy `supabase-room-schema.sql` then `supabase-participant-sync-policies.sql`
exist in this workspace but are ignored/untracked. They are NOT deployable from a clean Git
checkout and are not required for Nova launch. Sync SQL backfills null defaults and can skip
unique indexes when duplicate participants exist; its RLS repair replaces named policies.
Room cleanup routines can delete expired/session data when explicitly invoked/scheduled.
Restore/version/audit these files in a separate room-platform phase before re-enabling rooms.

All `synq/tests/*.sql` files are destructive/disposable test setup only, NEVER deployment
input. They must not be pasted into Supabase SQL Editor. No new planner tables are needed.

## Recovery

Back up data, compare existing table/constraint/function/policy definitions, then apply only
the Nova sequence while traffic is disabled. If any step fails, stop; no automated repair or
data merge. Identity FK validation can reveal missing owners and must not be bypassed. Keep
data during application rollback; use forward corrections rather than dropping schema.
The previous pass's disposable SQL results are historical evidence, not a claim this new
readiness routine has been executed against your database. Validate hosted RLS later using
the [single staging checklist](staging-launch-checklist.md).
