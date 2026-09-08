# Voxa Platform Hardening

## Audit and Scope

Voxa already has distinct sandbox, room-text and private voice-beta runtimes sharing
`voxaMessageClient`. Nova Path A remains the production voice path; Path B stays off.
The pass preserves these working boundaries and the existing BYOA/voice-beta changes
already present in the worktree. It does not enable external agents publicly.

The highest-impact weaknesses were:

1. External requests had no DNS/redirect protection, bounded JSON body, caller cancellation
   or request identity. Handshake onboarding required manual duplication of metadata.
2. Sandbox broadcasts waited for the slowest agent, then added simulated typing delays.
   Room requests could overlap or write stale UI after reset/removal.
3. Memory was turn-count bounded but not character bounded. Same-timestamp exchange rows
   could reverse order. Polling/realtime refreshes overlapped and events selected the oldest 50.
4. Showcase creator lookup used an auth-admin request per owner and an email-derived public
   fallback. Planned agents incorrectly had verification badges.
5. The analytics SECURITY DEFINER function was callable directly by authenticated clients.

## Implemented Architecture

- `app/lib/server/agents/runtime/endpoint.ts`: common JSON HTTP transport for verification
  and all external runtimes. Validates scheme/credentials/public addresses, validates every
  DNS answer, pins the chosen address to the socket, rejects redirects, caps body bytes and
  propagates cancellation. Original hostname is retained for TLS validation. Local endpoints
  require a public tunnel; endpoint authentication secrets are not imported or exposed.
- `runtime/context.ts`: explicit metadata whitelist and bounded agent-only history. Default
  room history load: 10 messages; outgoing ceiling: 12 messages, 4,000 characters/message,
  12,000 total characters. History is omitted without `memory_read_thread`; writes still
  require `memory_write_thread`. No participant email/profile or unrelated thread is sent.
- `runtime/requests.ts`: per-process, per-owner/session/agent in-flight coordination with
  60-second bounded replay cache. Request IDs are validated and passed to endpoints.
  No automatic retries of potentially side-effecting agent calls; retries are user-driven.
- `runtime/events.ts`: structured request, connection, completion, timeout and error logs,
  with request IDs and durations. No prompt/reply text, endpoint URL, token or key logging.
  `agent_first_response` means first usable full JSON reply, not first token or audio.
- `/api/agents/sandbox/message`: same ownership/review/verification gates; optional NDJSON
  delivers each completed agent independently. Legacy JSON clients remain supported using
  the same execution path. One failure is an individual result, not a failed whole broadcast.
- `/api/agents/room/message`: request coordination, cancellation, permission-filtered context,
  atomic two-row exchange insert, delayed analytics via Next `after`, classified failures.
  Context persistence finishes before success so immediate follow-ups can read it.

## Product Changes

- Developer console: endpoint-first discovery, explicit prefill, source selector retained,
  connection testing for existing records, state-specific next steps and sandbox entry links.
  Usage details collapse to reduce vertical noise. Detection does not save or approve anything.
- SDK: `createVoxaAgent` is a Fetch handler around any framework, with a runnable local Node
  bridge in `examples/agents/fetch-adapter`. No framework dependencies, autonomous registration,
  ownership claims, tool execution, marketplace, or publishing were introduced.
- Sandbox: immediate per-agent pending cards, independent reply arrival, request duration,
  stop, retry and reset. Late results are ignored. Connection metadata is collapsible.
  Artificial typewriter delays are removed; true upstream token streaming is still future work.
- Rooms: local external-agent thinking/error status is merged into the existing participant
  cards. Text capture/voice transport are not replaced. Text requests can be stopped/retried;
  stale history loads cannot replace an active interaction. Human mic state remains independent.
- Sync: parallel room/participant/event reads, latest events in chronological display order,
  coalesced polling/realtime loads, immediate online refresh, and protection against a late
  response restoring a different/left room. Concurrent invite conflict no longer duplicates
  join events or analytics.
- Public discovery: safe public-profile identity only, request-scoped query deduplication,
  searchable source labels, accurate Coming soon entries, UTC dates and accessible filter labels.
  Profile validation rejects reserved route usernames. Existing route structure stays intact.

## Rollout

1. Keep the existing flags unchanged. No new environment variables or provider changes.
2. Confirm the existing **server-only** `SUPABASE_SERVICE_ROLE_KEY` on the beta project.
3. On an existing database, run `voxa-beta/supabase-agent-analytics-server-writes.sql` after
   the original analytics schema. It replaces the function, checks service role and ownership,
   and revokes browser execution. It does not delete/reset counters or change read policies.
4. Deploy the beta app and the SDK/example changes together. During a mismatched deployment,
   analytics can be temporarily unavailable; agent messaging remains operational.
5. Test a public HTTPS adapter endpoint, then follow the existing review and verification flow.

No production SQL, environment updates, commits or deployments are performed by this pass.
`AGENTS.md` and `CLAUDE.md` are updated locally; they are currently tracked in this checkout,
so review staging explicitly if they should remain local. This pass does not change Git tracking.

## Validation

## File Inventory

New files authored for this pass:

- `voxa-beta/app/api/agents/discover/route.ts`
- `voxa-beta/app/components/AgentConnectionTest.tsx`
- `voxa-beta/app/lib/server/agents/runtime/endpoint.ts`
- `voxa-beta/app/lib/server/agents/runtime/context.ts`
- `voxa-beta/app/lib/server/agents/runtime/events.ts`
- `voxa-beta/app/lib/server/agents/runtime/requests.ts`
- `voxa-beta/supabase-agent-analytics-server-writes.sql`
- `voxa-beta/tests/register.cjs`, `runtime.test.cjs`, `routes.test.cjs`,
  `browser-smoke.mjs`, `analytics.sql`
- `packages/sdk/src/adapter.ts`, `packages/sdk/tests/adapter.test.mjs`
- `examples/agents/fetch-adapter/server.mjs`, `README.md`
- `docs/platform-hardening.md`

Behavioral updates to existing files:

- `voxa-beta/app/api/agents/sandbox/message/route.ts`
- `voxa-beta/app/api/agents/room/message/route.ts`, `room/invite/route.ts`
- `voxa-beta/app/lib/server/agents/runtime/voxaMessageClient.ts`, `types.ts`,
  `SandboxRuntime.ts`, `RoomTextRuntime.ts`, `VoiceAgentRuntime.ts`
- `voxa-beta/app/lib/server/agents/verification.ts`, `analytics.ts`, `room-memory.ts`,
  `showcase.ts`, and `voxa-beta/app/lib/server/developers/profile.ts`
- `voxa-beta/app/lib/agents/registry-client.ts`, `showcase-types.ts`
- `voxa-beta/app/lib/room-sync.ts`, `room.ts`
- `voxa-beta/app/components/AgentSelector.tsx`
- `voxa-beta/app/room/[roomId]/page.tsx`
- `voxa-beta/app/developers/agents/page.tsx`, `developers/sandbox/page.tsx`
- `voxa-beta/app/agents/AgentDirectoryClient.tsx`, `agents/[slug]/page.tsx`
- `voxa-beta/supabase-agent-analytics-schema.sql`, `packages/sdk/src/index.ts`
- Root README, beta README, SDK README, local AGENTS and CLAUDE documentation.

The working diff also contains **pre-existing** BYOA/import/private voice-beta changes.
They were retained, not recreated. Existing lint formatting violations were normalized,
including a few otherwise untouched files. Normalized compiled output for `RoomVoice`,
the auth/room store and wake-word modules is identical to HEAD; no Nova provider, Nova
API route, or Python agent source changed in this pass.

## Validation Commands

```sh
# From voxa-beta
npx tsc --noEmit
npm run build
npm run lint
node --require ./tests/register.cjs --test tests/runtime.test.cjs tests/routes.test.cjs

# From packages/sdk
npm run typecheck
npm run build
node --test tests/adapter.test.mjs

# From repository root
npm --prefix examples/agents/openclaw-adapter run build
node --check examples/agents/fetch-adapter/server.mjs
```

The route tests use controlled Supabase/agent boundaries and exercise real route handlers:
auth rejection, discovery sanitization, approval gates, independent sandbox replies, room
membership/permissions, memory isolation, duplicate suppression and timeout failures.
Transport tests cover DNS pinning, private/mixed DNS rejection, redirect/body limits,
safe logs, cancellation, request locks and context bounds. SDK tests cover handshake,
messages, input limits and exception redaction.

For browser checks, run a built app on port 3100, make Playwright available to Node, then
run `node tests/browser-smoke.mjs` from `voxa-beta`. `SMOKE_URL` changes the base URL;
`SMOKE_ARTIFACTS` changes screenshot output. The script uses explicit auth/API fixtures
for signed-in flows and makes no production writes. It also checks real unauthenticated
API rejection. Never interpret fixture tests as an end-to-end production voice test.

`tests/analytics.sql` is a fixture for an **empty disposable PostgreSQL database only**.
It creates test roles/tables, reapplies the migration, validates counters, owner RLS,
service writes, wrong-owner rejection, and browser/anonymous denial. Do not run the test
fixture in Supabase; run only the rollout migration there.

## Deliberate Limits and Next Phase

Validation results for this pass: beta typecheck/build/lint passed; SDK typecheck/build
and two adapter tests passed; ten runtime/API regression tests passed. All three existing
TypeScript examples built. The analytics fixture passed against isolated PostgreSQL 16.
Browser checks passed with controlled fixtures at 390px and 1440px, including registration
prefill/submission, sandbox broadcast/retry/reset, room invite/text/cancel/refresh and no
horizontal overflow or unhandled page errors. Production multi-device audio is not certified.

- Request locks/replay cache and rate limits are per process, not distributed. Exactly-once
  requests across Vercel workers need durable leases/idempotency storage and transactions.
- Cancellation is best effort after a request reaches an endpoint; external side effects and
  completed memory writes cannot be undone. Adapters should honor signals/request IDs.
- Agent thinking state is local to the initiating UI, not a new shared presence protocol.
  Room membership remains Supabase-authoritative; no endpoint gets the full room feed.
- True provider token streaming, shared external-agent audio, server-signed sandbox expiry,
  multi-tab presence leases and atomic last-human room ending are not implemented here.
- Existing sandbox IDs are structural, not signed: eligibility is revalidated server-side,
  but the displayed 30-minute expiry is not a server-enforced lease.
- Public endpoint validation reduces SSRF risk; deployment-level egress rules, authenticated
  endpoint contracts, durable rate limiting and ownership challenges remain important.
- Live multi-account Supabase/LiveKit calls and real Nova provider audio require configured
  accounts/devices and a separate staging test. Nova behavioral code remains unchanged.

Recommended next phase: durable agent/room sessions and idempotency, signed sandbox leases,
atomic room lifecycle RPCs, then authenticated streaming adapter transport. Keep public
publishing and additional voice access gated until those boundaries are verified.
