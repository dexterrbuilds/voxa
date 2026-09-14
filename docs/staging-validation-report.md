# Synq staging validation report

## Decision

**NOT READY FOR PHASE 2B.** Pre-flight is blocked; no hosted staging validation has
been performed in this pass. Automated tests are not evidence of real wallet
provisioning or hosted RLS. This is an interim report to complete after configuration.

Repository inspected: `0f92d1be532183632816038baca2e675dac9f204`.
Working tree was clean before this report. Environment inspected: local development
checkout only. No confirmed staging Supabase project, Privy application, Vercel
project or deployed origin has been supplied. No provider credentials are recorded here.

## Pre-flight evidence

| Item | Local observation | Required action before live validation |
| --- | --- | --- |
| Privy | Public app ID and server secret missing | Configure a separate staging app, email login, embedded Solana wallets and exact origins |
| Supabase | URL, anon key and service credential present, not verified | Confirm non-production project reference and authorized access; do not infer staging from local variables |
| Auth bridge | Private database-auth JWK missing; hosted trust unknown | Configure a dedicated trusted ES256 key with matching kid, server-only |
| Solana | Dedicated RPC URL missing | Configure dedicated HTTPS mainnet RPC |
| Jupiter | API key missing | Configure server-only production quote access |
| Model | Google key present, not verified; Gemini default | Validate conversational/transaction explanation in staging |
| Deployment | No local Vercel project link found | Confirm Vercel project/root `synq` and exact staging origin/environment |
| Flags | Privy default, platform hidden, Solana disabled | Retain hidden platform; enable Phase 2A only after prerequisites |

`node scripts/check-configuration.cjs` reports missing Privy app ID/secret and
`SUPABASE_AUTH_BRIDGE_JWK`, no invalid configured values, execution disabled.
Its optional Solana group is empty while the flag is off; that does NOT mean RPC
and Jupiter credentials exist. A separate names-only presence check confirmed both
are missing. Hosted public/server variables have not been inspected.

The naming migration replaced the earlier legacy-domain source default with configurable
deployment URLs and localhost fallbacks. Neither is confirmation of a staging deployment.
No Supabase, Privy or Vercel connector is available in this task's tool inventory.

## Migration status: NOT APPLIED

Exact intended order, after target confirmation and backup/schema capture:

1. `synq/supabase-nova-launch.sql`
2. `synq/supabase-nova-quotes.sql`
3. `synq/supabase-privy-identity.sql`

All three files were reviewed, but none was executed against any database in this pass.
No current hosted schema version, table counts, policy definitions, function definitions
or backup/recovery capability has been captured. These are blocking prerequisites.

Static findings: no table drops, truncation or migration-time row deletion. Identity
replaces three owner foreign keys while preserving UUID values, changes their target to
`synq_users`, adds cascade deletion semantics and replaces a compatibility trigger.
These changes still require comparing the real staging schema before application.
The first file is not explicitly transaction-wrapped; use a transactional application
session for it. Quotes and identity have their own begin/commit blocks. Never run test SQL.

After launch, inspect its tables, constraints, policies, grants and functions directly;
`nova_launch_readiness()` does not exist until quotes is applied. After quotes, verify
the service-only probe returns version 2/ready and inspect the review routine/grants.
After identity, inspect mapping/revocation tables, foreign keys, trigger, service-only
resolver and owner RLS with real bridge tokens. Probe success alone does not prove RLS.
Stop after any failure. Reapply only in full order; launch alone downgrades approval.
See [migration audit](migration-readiness.md) for recovery and dormant-schema caveats.

## Live acceptance results

| Check | Result |
| --- | --- |
| Privy email/optional Google dashboard configuration | NOT VERIFIED |
| Real staging account A / Synq UUID / Privy DID | NOT CREATED or recorded |
| Embedded Solana wallet creation | NOT TESTED |
| Same wallet and UUID after logout/login/concurrent refresh | NOT TESTED; hard release gate |
| Second staging user / bidirectional isolation | NOT TESTED; hard release gate |
| Supabase bridge authentication / owner SELECT / browser write denial | NOT TESTED against hosted services |
| Owned vs inspected address separation | Automated fixtures pass; real account NOT TESTED |
| Funding amount / signature / resulting balance | NONE / none / not observed |
| Real owned-wallet portfolio, tokens, history, transaction explanation | NOT TESTED |
| Real authenticated Jupiter quote / balance-relative quote | NOT TESTED |
| Expiry, refresh, old approval invalidation | Automated fixtures pass; hosted NOT TESTED |
| Explicit review approval with execution disabled | Automated fixtures pass; hosted NOT TESTED |
| Real session refresh, expiry, revocation and relogin | NOT TESTED |
| Physical mobile login/callback/wallet/quote/session | NOT TESTED |
| DEXTER planner | Automated graph and route tests pass; deployed browser NOT TESTED |

Funding is left to the user after wallet persistence is verified. This pass must not
perform transfers. No wallet was funded, no assets moved and no chain transaction was
constructed, signed or broadcast. No live latency measurements were taken; fixture
timings and earlier historical public-provider checks are not staging evidence.

## Local validation and security (original blocked pre-flight)

Rerun against the unchanged commit:

- Beta: `node --require ./tests/register.cjs --test tests/*.test.cjs`: **86 passed**.
- SDK: `node --test tests/adapter.test.mjs`: **3 passed**.
- Exact current total: **89 passed, 0 failed**. No tests added or weakened.
- Local login URL returned HTTP 200. In-app browser inspection encountered an old
  connection-error page; no successful real browser auth test is claimed.
- Lint/typecheck/production build and SDK builds were green at the supplied readiness
  checkpoint; not rerun in this documentation-only blocked pre-flight. Full build and
  browser acceptance remain required after actual staging fixes/configuration.

Focused source inspection and tests confirm Nova's simulation and quote adapters'
`execute` methods throw, review returns `transactionSignature: null`, and the planner
cannot run disabled state-changing capabilities. Privy wallet signing/export/submission
hooks are not used by the launch identity boundary. Database JWT signing is exclusively
an owner-scoped auth bridge, not wallet signing. No execution capability was introduced.

Regression coverage includes forged/expired sessions, canonical wallet pinning, inspected
address isolation, short-lived UUID RLS tokens, quote hash/expiry/owner checks, bounded
RPC methods/context, transaction-field rejection, planner mutation/disabled capability
checks, and byte-identical legacy Nova room voice. These do not substitute for hosted
two-user RLS tests or real wallet persistence.

No application blockers were fixed because no authenticated staging environment was
available. No application code, dependencies, migrations, secrets, env files or local
memory files were changed. No deployment or push was performed.

The subsequent naming-only pass moved the app to `synq/` and ran 96 regressions plus
Nova, Privy, Phase 2A and planner browser fixtures; app/marketing/SDK builds pass.
See [naming validation](synq-naming-migration.md). Those local results do not change
this report's blocked live-staging decision or imply any migrations were applied.

## Required next input and resume gate

Confirm the non-production Supabase project reference and backup/recovery path, staging
Vercel project/URL, and public Privy app ID. Supply credentials only through secure local
environment/provider dashboards, never chat or Git. Then follow the
[single staging checklist](staging-launch-checklist.md), record each real acceptance
result above, rerun validation after any fixes, and only change this decision after all
hard requirements pass. Phase 2B remains prohibited until separately authorized.
