# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in the Voxa repository.

## Platform Hardening (Current Follow-Up)

The real product is still `voxa-beta/`. Nova Path A, human LiveKit audio, auth and
the existing default-off external-agent gates are preserved. The worktree also includes
the pre-existing private external voice beta; this pass does not enable it.

- Shared outbound transport: `runtime/endpoint.ts` validates public DNS, pins sockets,
  rejects redirects, bounds JSON, and propagates aborts. Handshake discovery and all
  external runtimes reuse it. Local endpoints need a public HTTPS tunnel.
- `POST /api/agents/discover` is authenticated, rate-limited and descriptive only.
  `AgentConnectionTest` explicitly prefills metadata; never grants permissions/review.
- `runtime/context.ts` bounds permitted per-agent history to 12 messages / 12,000
  characters. Existing DB history default is 10. No full room transcript/private profile.
- `runtime/requests.ts` coordinates per-process requests (60-second replay cache).
  It is NOT distributed/exactly-once. Timeouts/cancellations are classified in transport.
- Sandbox NDJSON delivers completed agent replies independently, NOT token streaming.
  Artificial typing delays are removed; stop/reset/late-response guards are implemented.
- Room polling is coalesced; room/participants/latest events load in parallel. Local
  external thinking/error states use existing participant cards. No shared state protocol added.
- Analytics increments now use service role only. Apply
  `supabase-agent-analytics-server-writes.sql` with the updated app; owner SELECT RLS stays.
  Existing `SUPABASE_SERVICE_ROLE_KEY` is required server-side. No new env variables.
- Public creator identity comes only from developer profiles, never auth/email fallbacks.
  Planned first-party agents no longer claim verification.
- SDK `createVoxaAgent` is a bounded Fetch handler; runnable bridge:
  `examples/agents/fetch-adapter`. Framework adapters remain untrusted until reviewed.

Validation: beta `npx tsc --noEmit`, `npm run build`, `npm run lint`;
`node --require ./tests/register.cjs --test tests/runtime.test.cjs tests/routes.test.cjs`.
SDK: typecheck/build + `node --test tests/adapter.test.mjs`.
Browser fixture tests: `tests/browser-smoke.mjs`; PostgreSQL test:
`tests/analytics.sql` (**disposable DB only**, never Supabase).
See `docs/platform-hardening.md` for rollout and limits.

Known debt: distributed leases/rate limits, signed server-enforced sandbox expiry,
atomic room ending/multi-tab presence, true token streaming, authenticated endpoint
ownership. No production migration/deployment was performed. Keep README, beta README,
AGENTS and CLAUDE in sync; do not push local context files intentionally. These memory
files are currently tracked in this checkout despite earlier local-only guidance.


## Product Philosophy

Voxa is **not** building an AI meeting assistant.

Voxa is building the **infrastructure layer for conversational AI**.

Nova is the first demonstration agent, **not** the product itself.

Every architectural decision should move Voxa closer to:

- Multi-agent conversations
- Developer-owned agents
- Agent identity
- Agent permissions
- Agent memory
- Cross-platform deployment
- Agent marketplaces
- Conversational operating systems

When evaluating a change, ask: *does this generalize beyond Nova, or does it hardcode
the demo?* Prefer the version that moves toward an agent runtime. Today the codebase
hardcodes a single agent ("nova") in many places — treat that as debt to unwind, not a
pattern to extend.

## Current implementation status

Nova Path A remains the production voice experience. External agents now support
registration, review, verification, sandbox messaging, multi-agent sandbox sessions,
experimental room visibility, text-only room access, per-agent room memory, permissions
enforcement, a public developer showcase, owner-scoped usage analytics, and public
developer profiles. This is still **not** a marketplace, billing system, or social
network: no public installs, public room invites, following, messaging, likes, ratings,
comments, billing, rankings, payments, monetization, metering, pricing, quotas, or
external-agent audio/LiveKit access.

## Current Phase

Phase 3 platform hardening, following BYOA / Self-Import.

## Completed Phases

- 3.0 Runtime Foundation
- 3.1 Registration
- 3.2 Review
- 3.3 Verification
- 3.4 Sandbox
- 3.5 Sandbox Messaging
- 3.6 Sandbox Runtime
- 3.7 Streaming + Tools
- 3.8 Multi-Agent Sandbox
- 3.9 Room Visibility
- 3.10 Room Text Agents
- 3.11 Room Memory
- 3.12 Room UX Polish
- 3.13 Permissions Enforcement
- 3.14 Agent Showcase
- 3.15 Agent Analytics & Usage Dashboard
- 3.16 Developer Profiles & Identity
- 3.17 Bring Your Own Agent / Self-Import
- Current follow-up: platform hardening (see above)

## This repo is 4 projects plus the SDK foundation

1. **`src/`** — Vite + React 19 SPA. The **marketing site** (`/`, `/product`,
   `/developers`, `/use-cases`, `/waitlist`) PLUS a **mock-only** product prototype under
   `/voxa/*` (no backend; static data in `src/lib/rooms.ts`, simulated auth). Do not
   confuse the `/voxa/*` mock with the real product.
2. **`voxa-beta/`** — **Next.js 16 (App Router). THE REAL PRODUCT.** Auth, rooms, Nova voice.
3. **`voxa-agent/`** — Python LiveKit Agent (Gemini Live realtime). Built but
   feature-flagged OFF. Deployed separately to LiveKit Cloud.
4. **`api/subdomain.js`** — Vercel stub, currently non-functional.
5. **`packages/sdk/`** — Local SDK v0.1 foundation. Typed developer-facing agent
   contract only; no networking, auth, billing, publishing, marketplace, onchain
   identity, or LiveKit dispatch yet.

## Feature flags / deployment notes

- `NEXT_PUBLIC_NOVA_LIVEKIT_AGENT_ENABLED` — disabled Path B LiveKit Agent dispatch.
- `NEXT_PUBLIC_WAKE_WORD_ENABLED` — optional browser-side Picovoice wake word.
- `EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS` — server-only, default-off external agent
  visibility/text-only room access. Never expose as `NEXT_PUBLIC`.
- `/agents` needs `SUPABASE_SERVICE_ROLE_KEY` to show external public agents; without it,
  the page safely falls back to first-party showcase cards.

## Validation commands

- `cd voxa-beta && npx tsc --noEmit`
- `cd voxa-beta && npm run build`
- `cd packages/sdk && npm run typecheck`
- `cd packages/sdk && npm run build`

## Public Agent Showcase

Route: **`/agents`** in `voxa-beta`; detail route **`/agents/[slug]`**.

`app/lib/server/agents/showcase.ts` reads only `status=approved`,
`verification_status=verified`, `visibility=public` records and maps them to sanitized
public profiles. It never exposes endpoint URLs, creator user ids, metadata, admin notes,
review notes, verification reports, or internal fields. The page is discovery-only: no
installs, room invites, payments, reviews/ratings, or runtime behavior changes.

## Agent Analytics

Route: **`/developers/agents`** in `voxa-beta`.

Analytics are owner-scoped aggregate counters, not billing or metering. The additive SQL
is `voxa-beta/supabase-agent-analytics-schema.sql`, which creates
`public.agent_analytics` and the SECURITY DEFINER RPC
`increment_agent_analytics(...)`.

Counters: sandbox sessions, sandbox messages, room invites, room messages, and
`last_active_at`. Recording happens server-side after existing validation succeeds:
`/api/agents/sandbox`, `/api/agents/sandbox/message`, `/api/agents/room/invite`, and
`/api/agents/room/message`. `/api/agents` and `/api/agents/:id` return analytics only for
the authenticated developer's own agents. Public showcase routes never expose analytics.

## Developer Profiles

Routes:

- Public profile: **`/developers/[username]`** in `voxa-beta`
- Authenticated profile API: **`/api/developers/profile`**
- Profile completion UI: **`/developers/agents`**

Schema: `voxa-beta/supabase-developer-profiles-schema.sql` creates
`public.developer_profiles` with safe public fields only: `username`, `display_name`,
`bio`, `avatar_url`, `website`, `x_handle`, and `joined_at`.

Public profiles are server-rendered through `app/lib/server/developers/profile.ts`.
They show safe identity fields and approved + verified + public agents only. Never expose
emails, Supabase user ids, auth metadata, endpoint URLs, internal metadata, admin notes,
review notes, verification reports, or analytics. Agent detail pages link
"Built by {Developer}" to `/developers/[username]` when a profile exists; `/agents` shows
a simple Featured Developers section.

## Dev commands

- Marketing/SPA (repo root): `bun run dev` (Vite, http://localhost:5173),
  `bun run build`, `bun run lint`, `bun run format`
- Product: `cd voxa-beta && npm install && npm run dev` (Next, http://localhost:3000)
- Agent: `cd voxa-agent && pip install -e . && python src/agent.py dev`
- SDK: `cd packages/sdk && npm run typecheck`
- Focused runtime/API tests exist in `voxa-beta/tests`; SDK tests in `packages/sdk/tests`.

## voxa-beta architecture (the real product)

- **Auth/data:** Supabase. The browser uses the anon key + the user's session. Server
  routes verify the user via their bearer token (`supabase.auth.getUser`), then query
  with that same anon client — so **all access control depends on Supabase RLS policies**.
  Those policies currently live in **gitignored SQL** (`supabase-room-schema.sql`,
  `supabase-participant-sync-policies.sql`), NOT in the repo. Treat room access as
  unverified until the policies are checked/restored in-repo.
- **State:** Zustand stores in `app/lib/store.ts` (auth + room). Local room state in
  `sessionStorage`; shared room state synced through Supabase tables `rooms`,
  `room_participants`, `room_events` via `app/lib/room-sync.ts` (realtime subscription +
  3s polling + 15s heartbeat).
- **Voice transport:** LiveKit Cloud. Human join tokens are minted server-side by
  `app/api/livekit/token/route.ts` (mic publish, 1h TTL).

## Nova has TWO implementations — know which you're touching

- **Path A — ACTIVE (current MVP), call-to-wake, turn-based:**
  `app/components/RoomVoice.tsx` records a **silence-bounded** clip →
  `POST /api/agents/nova/respond` → Deepgram STT (multilingual `language=multi` by
  default) → Gemini (`app/lib/server/nova/providers/llm/gemini.ts`, with Google Search
  grounding + injected current date) → Edge/OpenAI TTS →
  `app/lib/server/nova/livekit-publisher.ts` decodes the MP3 and publishes audio as an
  **ephemeral** LiveKit participant (`agent:nova:playback:<uuid>`). Each turn opens and
  tears down a fresh LiveKit connection.
  - **Short-term session memory (per room):** each user prompt + Nova reply is persisted
    to `room_events` under `type` `nova_user`/`nova_reply` by
    `app/lib/server/nova/memory.ts`; the route loads the last `NOVA_MEMORY_TURNS`
    messages (default 12) and passes them to Gemini as conversation history so
    follow-ups ("that", "it") resolve. These rows are filtered out of the room event
    feed (`room-sync.ts`). This is **session-only / no long-term/cross-room memory**:
    when the room closes (last human leaves), the `nova_user`/`nova_reply` rows are
    deleted by the SECURITY DEFINER fn `cleanup_nova_room_memory(room_id)`, called
    best-effort from `leaveSharedRoom` (normal events preserved); the hourly
    `cleanup_expired_voxa_rooms` sweep is the backstop. `runNovaPipeline` in
    `pipeline.ts` is still **dead code**.
  - **Capture length is silence-based, not a fixed window.** A Web Audio
    `AnalyserNode` (in `VoiceSession`) measures live mic RMS and stops the recorder
    after ~2s of post-speech silence, with a ~15s hard-cap fallback. Tunables live in
    `app/lib/voice-activation.ts` (`NEXT_PUBLIC_NOVA_SILENCE_TIMEOUT_MS`,
    `NEXT_PUBLIC_NOVA_MAX_RECORDING_MS`, `NEXT_PUBLIC_NOVA_SILENCE_THRESHOLD`).
    `NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS` is legacy/unused for capture length. Nova's
    UI states are **In Room** (idle; wake worker may be armed locally, NOT recording) →
    **Listening** (wake phrase fired, recording the prompt) → **Thinking** →
    **Speaking** → back to In Room.
  - **Voice controls are fixed at the bottom of the room.** `RoomVoice` is mounted in a
    mobile-safe floating panel with `env(safe-area-inset-bottom)`, and the room page
    reserves bottom padding so content is not covered. The human Mute/Unmute control
    changes only the LiveKit room mic; **Talk to Agent** starts a separate agent capture
    stream and auto-sends after silence.
  - **Two ways to start a Path-A capture:** (1) **call-to-wake** — the DEFAULT, a
    browser-side "Hey Nova" wake word via Picovoice Porcupine Web that can auto-start
    once Nova is in the room only when `NEXT_PUBLIC_WAKE_WORD_ENABLED=true`; and (2) the **Talk to Agent** button — a
    prominent manual fallback using the same silence-based capture. Both call
    the same `startNovaRecording()` flow; the room mic stays independent of both. Wake
    detection is **local-only** (WASM worker; the wake audio never hits the backend).
    **Gated on Nova being in the room:** the worker (and the mic permission it needs)
    only start when `connected && novaInRoom` — if no active/default agent is invited,
    tapping Talk to Agent shows "Invite an agent to the room first." and starts nothing; if Nova
    leaves/room ends/voice drops, the worker stops and state resets. `novaInRoom` is
    threaded from `room/[roomId]/page.tsx` → `RoomVoice` → `VoiceSession`. Lives in
    `app/lib/wake-word/` (`config.ts`, `WakeWordController.ts`, `useWakeWord.ts`). Off
    unless `NEXT_PUBLIC_WAKE_WORD_ENABLED=true` plus a valid
    `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` + `porcupine_params.pv` model are present. If the
    flag is false or Picovoice throws activation/trial errors, skip Picovoice and show
    "Wake word is temporarily unavailable"; Talk to Agent remains fully functional. A true
    "Nova" keyword needs a custom Web/WASM `.ppn` from the Picovoice Console.
- **Path B — DISABLED (vision-aligned):** `voxa-agent/src/agent.py` is a Gemini Live
  native-audio realtime agent dispatched via `/api/agents/nova/dispatch`, gated behind
  `NEXT_PUBLIC_NOVA_LIVEKIT_AGENT_ENABLED === "true"` (see `app/lib/room.ts`). Lower
  latency and the right primitive for the multi-agent / cross-platform future, but off
  by default.

If you touch Nova, state which path. Generalizing the agent layer should favor Path B's
dispatch+worker model over Path A.

## Provider abstraction

`voxa-beta/app/lib/server/nova/providers/` isolates STT (Deepgram, `nova-3`,
`language=multi` multilingual default), LLM (Gemini), and TTS (Edge default, OpenAI
fallback). Swap/extend providers here. All provider errors flow through
`app/lib/server/nova/errors.ts` (`NovaProviderError`, with token/key redaction in
messages).

## Agent Runtime foundation

The runtime foundation lives in `voxa-beta/app/lib/runtime/`.

- `types.ts` defines `AgentId`, `AgentStatus`, `AgentCapability`, `AgentIdentity`,
  `AgentRuntimeContext`, `AgentMessage`, and `AgentResponse`.
- `Agent.ts` defines the runtime `Agent` interface and `BaseAgent` class.
- `AgentRegistry.ts` owns registration/lookup/listing.
- `AgentRuntime.ts` exposes `registerAgent`, `unregisterAgent`, `getAgent`,
  `listAgents`, `joinAgentToRoom`, `removeAgentFromRoom`, and `dispatchMessage`.

This layer is intentionally server-safe and side-effect-light. It does not replace the
active Nova Path A pipeline yet. It exists so future agents can share a runtime contract
instead of copying Nova-specific assumptions.

Nova's first-party runtime wrapper lives in `voxa-beta/app/lib/agents/nova/`.
`NovaAgent` implements the runtime interface and centralizes Nova identity/capabilities:
voice, memory, multilingual, web search, and realtime room participation. Today it is
metadata/foundation only; `/api/agents/nova/respond` remains the active voice pipeline.

The first-party agent manifest lives in `voxa-beta/app/lib/agents/manifest.ts`. It
contains only Nova today and exposes `getAvailableAgents()`, `getAgentById(agentId)`,
`isFirstPartyAgent(agentId)`, `getDefaultAgent()`, and
`getAgentParticipantUserId(agentId)`. Product UI should read safe agent display/invite
metadata from this manifest instead of hardcoding labels. Legacy compatibility remains:
Supabase `room_participants.user_id` still stores the agent id (`"nova"` for Nova) until
the DB gains a dedicated agent identity column and a DB-backed agent registry.
Manifest entries include `availability`, `category`, `shortLabel`, and `tags`. Nova is
the only `available` agent today. Research Agent, Meeting Summarizer, and Code Assistant
are `coming_soon` placeholders only — no backend, DB, marketplace, billing, or external
agent behavior exists for them.

Generic invite flow exists but is first-party only:

- `useRoomStore().inviteAgent(roomId, agentId)` handles local/session fallback.
- `inviteAgentToSharedRoom(roomId, agentId)` handles Supabase room participants/events.
- `useRoom().inviteAgentShared(roomId, agentId)` is the app-facing shared-room helper.
- `inviteNova` / `inviteNovaShared` remain compatibility wrappers around `agentId =
  "nova"`.

When inviting an agent, validate through the manifest and use
`getAgentParticipantUserId(agentId)` before writing to `room_participants.user_id`.
Do not add an `agent_id` DB column until a deliberate migration is requested.

`voxa-beta/app/components/AgentSelector.tsx` is the current manifest-driven first-party
agent selector. It renders `getAvailableAgents()`, shows metadata/capabilities/in-room
state, and calls the generic invite path by `agentId` only for agents with
`availability: "available"`. Coming-soon entries are disabled and must not call
`inviteAgent`. Do not add external/developer agents here until the registry/auth/
publishing model exists.

The local SDK foundation lives in `packages/sdk/` and exposes a developer-facing
`VoxaAgent` base class plus matching types. It is v0.1 only: typed future registration
metadata exists, but no live network registration, auth, marketplace, billing, onchain
identity, or deployment workflow is implemented yet.

## Agent registration scaffold

`voxa-beta/` has an authenticated, owner-scoped scaffold for future external agent
metadata:

- `POST /api/agents/register`
- `GET /api/agents`
- `GET /api/agents/:id`
- `PATCH /api/agents/:id`

The additive SQL is `voxa-beta/supabase-agent-registration-schema.sql`. It creates
`public.agents` as a review queue with status (`draft`, `pending_review`, `approved`,
`rejected`, `disabled`), visibility (`private`, `unlisted`, `public`), creator,
endpoint, capabilities, permissions, tags, and metadata fields. Developers can only
create/update their own draft or pending-review records; public visibility and
self-approval are intentionally blocked by both API validation and RLS.

This scaffold does **not** enable external agents in rooms, does **not** feed
`AgentSelector`, and does **not** change `room_participants.user_id = "nova"`. Treat it
as future registry/review infrastructure only until endpoint verification, permission
enforcement, rate limits, abuse protection, approval tooling, and a DB-backed runtime
registry are implemented.

The developer-facing UI for this scaffold is `voxa-beta/app/developers/agents/page.tsx`
(route **`/developers/agents`**), backed by the browser client
`voxa-beta/app/lib/agents/registry-client.ts`. It is an authenticated dashboard (signed-in
Voxa user required; otherwise a sign-in CTA + redirect to `/login?next=/developers/agents`)
that lists the caller's own submissions and lets them register/edit `draft` /
`pending_review` records through the `/api/agents/*` routes using the user's Supabase
bearer token. It lives in voxa-beta (not the marketing SPA) so it shares the session and
calls the API same-origin. The UI mirrors the backend posture (only draft/pending_review
status, only private/unlisted visibility, no self-approval, no public publishing) and shows
a standing "registered agents are not available in live rooms until reviewed and approved"
warning. Registration remains **registration-only**: submissions never feed `AgentSelector`
or join rooms. The marketing docs page `/developers/docs/registration` (in `src/`) links out
to this dashboard. Do not wire registered agents into rooms until approval tooling and a
DB-backed runtime registry exist.

## Bring Your Own Agent / self-import (Phase 3.17)

Developers can self-import an EXISTING agent from another runtime (OpenClaw, LangChain,
CrewAI, AutoGen, other) into the SAME registration flow. The import source is descriptive
provenance only — it NEVER bypasses review, verification, sandbox, permissions, or room
gating, and imported runtimes (especially OpenClaw) are NOT trusted by default.

- **Model:** additive columns on `public.agents` via `supabase-agent-import-schema.sql` —
  `import_source text default 'custom_endpoint'` and `import_metadata jsonb default '{}'`.
  The client-safe source model is `app/lib/agents/import-sources.ts` (`ImportSource`,
  `IMPORT_SOURCE_META`, `normalizeImportSource`, `importSourceShowcaseLabel`).
  `registration.ts` validates/normalizes `import_source` (unknown → `custom_endpoint`) and
  cleans `import_metadata` (repository/docs URLs go here — internal, never exposed publicly).
- **Dashboard:** `/developers/agents` adds a Source/runtime selector, optional repository +
  docs URLs, a per-source adapter note (esp. OpenClaw must expose a Voxa-compatible adapter
  endpoint), and a standing security panel ("Voxa never runs your tools; only explicit user
  messages are sent; reviewed + sandboxed before rooms; no room audio/transcript; OpenClaw
  not trusted by default").
- **Adapter contract:** an imported agent wraps its runtime behind the SAME Voxa endpoints
  (`GET /health`, `POST /voxa/handshake`, `POST /voxa/message`, optional `POST /voxa/voice`).
  The adapter maps Voxa request → upstream runtime → Voxa response. Sample mock at
  `examples/agents/openclaw-adapter/` (no real OpenClaw credentials needed).
- **Verification: NO bypass.** Imports still require endpoint reachable + valid handshake +
  compatible SDK/protocol + declared capabilities + admin approval (unchanged
  `runAgentVerification`).
- **Showcase:** public agent cards/detail show a friendly provenance label
  (`PublicAgent.importLabel`): "Native Voxa Agent" (first-party), "Custom Endpoint",
  "Imported from OpenClaw", etc. Never exposes endpoint URLs or internal metadata.

## Admin agent review tooling

The admin review surface lets authorized reviewers move submitted agents through the
approval lifecycle. **Admin auth model:** there is no role table; admins are the
server-only `ADMIN_EMAILS` allowlist (comma-separated). A caller is admin if their
authenticated Supabase email is in that list. Because developer routes are RLS-scoped to
their own records (and RLS blocks `approved`/`disabled` writes), the admin routes
authenticate the caller against `ADMIN_EMAILS` and then use a **service-role client**
(`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS. Both env vars are server-only — never
`NEXT_PUBLIC`. Server helpers live in `voxa-beta/app/lib/server/agents/admin.ts`
(`requireAdmin`, `isAdminEmail`, `reviewTransitions`, `mapAdminAgentRecord`,
`resolveCreatorEmails`).

Routes (`runtime = "nodejs"`): `GET /api/admin/agents` (all statuses, optional
`?status=` filter, creator emails resolved best-effort via the service-role admin API) and
`PATCH /api/admin/agents/:id/review` (`{ action, note? }`). Allowed transitions:
`pending_review→approved`, `pending_review→rejected`, `approved→disabled`,
`disabled→approved`, `rejected→pending_review`; anything else is `409`. The server is the
source of truth and re-validates every transition. Non-admins get `403` (`not_admin`),
unauthenticated `401`. The UI is `voxa-beta/app/admin/agents/page.tsx` (route
**`/admin/agents`**, browser client `app/lib/agents/admin-client.ts`) with status filters,
full agent detail, and Approve/Reject/Disable/Return-to-review actions.

The additive SQL is `voxa-beta/supabase-agent-review-schema.sql` (adds `reviewed_by`,
`reviewed_at`, `review_note` + a review-queue index; no RLS change since service-role
bypasses RLS). **Approval is review-only:** it does NOT feed `AgentSelector` or let an agent
join rooms. External agents stay out of live rooms until a DB-backed runtime registry is
intentionally enabled.

## Agent verification & sandbox (Phase 3 prep — still off for rooms)

This phase prepares external agents WITHOUT letting them into production rooms.

- **Verification axis (orthogonal to review `status`).** `supabase-agent-verification-schema.sql`
  adds `verification_status` (`verification_pending` default | `verified` | `verification_failed`),
  `verified_at`, `verification_note`, `verification_report jsonb` + an index. An agent can be
  `approved` yet still unverified; both review and verification gate the sandbox, never rooms.
- **Endpoint health check service** (`app/lib/server/agents/verification.ts`,
  `runAgentVerification`). POSTs `{ type: "voxa.handshake" }` to the agent's `endpoint_url`
  (5s timeout) and runs three checks: `endpoint_reachable`, `sdk_compatible` (protocol
  `voxa-agent`, SDK version in `SUPPORTED_SDK_VERSIONS`), `capability_payload` (declared
  capabilities ⊆ endpoint-reported). The handshake contract mirrors `@voxa/sdk`'s
  `createAgentHandshake()`. Admin-triggered via `POST /api/admin/agents/:id/verify`
  (service-role; writes the verification axis). The admin page exposes a "Verify endpoint"
  button + verification badge/notes.
- **Developer sandbox** (`POST /api/agents/sandbox`, page `/developers/sandbox`). Developer
  auth + anon/bearer client (RLS-scoped to own agents). Allows a sandbox session ONLY for the
  caller's own agent that is BOTH `approved` AND `verified` (`app/lib/server/agents/sandbox.ts`,
  `checkSandboxEligibility` / `createSandboxSession`). It returns an **isolated** descriptor
  (namespaced `sandbox:<agentId>:<uuid>` room id, 30-min TTL, `runtimeReady: false`).
- **Sandbox messaging is live** (`POST /api/agents/sandbox/message`, Phase 3.5+). Stateless
  session: `parseSandboxSessionId` extracts the agent id(s) from the session id and the route
  re-validates ownership + approval + verification on every call, then `SandboxRuntime`
  (`app/lib/server/agents/runtime/`) POSTs the SDK `voxa.message` contract
  (`{ type: "voxa.message", message, context: { sandbox: true } }`) to each agent's message
  endpoint — derived from the registered handshake URL (`…/voxa/handshake` → `…/voxa/message`).
  Rate-limited per user (30/min, in-memory; `app/lib/server/rate-limit.ts`) → `429`. Errors are
  structured (`agent_unreachable`, `agent_bad_response`, `invalid_sandbox_session`,
  `agent_not_found`, `agent_not_approved`, `agent_not_verified`). This still does NOT create a
  production room/participant, mint a LiveKit token, or place the agent in a room.
- **Multi-agent sandbox sessions (Phase 3.8).** A session can reference one OR MORE of the caller's
  own approved + verified agents. `POST /api/agents/sandbox` takes `{ agentIds: string[] }` (legacy
  `{ agentId }` kept), validates every agent (owned/approved/verified/has-endpoint), and returns a
  session whose id encodes all ids (`sandbox:<id1>,<id2>:<uuid>`, `SANDBOX_MAX_AGENTS = 5`) plus an
  `agents` summary array. The message route routes by `targetAgentId` (must be in the session),
  `broadcast: true` (all session agents via `SandboxRuntime.broadcastMessage`, per-agent results),
  or default (first/active agent), returning a `replies[]` array (`{ agentId, agentName, ok,
  reply | error }`). The `/developers/sandbox` page multi-selects eligible agents, starts a session,
  picks the active agent via pills, and offers **Send to {agent}** / **Send to all**; each agent
  reply is labeled, independently streamed, with its own Tools Used panel. Sandbox-only — NOT a
  production multi-agent room; agents never enter the Agent Selector or live rooms.
- **Runtime abstraction** (`app/lib/server/agents/runtime/types.ts`,
  `SandboxRuntime.ts`). `AgentRuntimeTransport` is the reusable interface (`sendMessage`,
  `sendMessageToAgent`, `broadcastMessage`); `SandboxRuntime` (`mode: "sandbox"`, forces
  `sandbox: true`, parallel fan-out) is the only implementation today. A future `ProductionRuntime`
  will implement the same interface with room/LiveKit dispatch — not built yet.
- **Sandbox runtime v2/v3 UI** (`/developers/sandbox`, Phases 3.6–3.7). The page is a mini runtime
  environment, not just a chat: an agent metadata panel (name, slug, status, verification,
  endpoint, capabilities, permissions, tags + a standing "Sandbox only — not available in live
  rooms yet."), a runtime status model, conversation history with per-turn timestamps + a Reset
  button, and session-expiry handling (the panel polls `session.expiresAt`, shows an Expired
  state, and offers "Start new session" — keyed by `sandboxRoomId` so a new session remounts a
  clean conversation). Message UX: textarea, Enter to send / Shift+Enter for newline,
  empty-message validation, send disabled while busy, structured endpoint errors inline.
- **Streaming + tool simulation (Phase 3.7).** The wire reply (`VoxaMessageResponse`) may carry
  optional `streaming?: boolean` and `tools?: AgentToolInvocation[]` (`{ name, status, detail? }`,
  status `pending|running|completed|failed`). `SandboxRuntime` parses these defensively (drops
  malformed tools, caps the list) and the message route returns them. The current sandbox
  delivers each completed reply over NDJSON immediately; simulated typing delays were removed.
  This is not provider token streaming. Tools render as a read-only "Tools Used" panel. Voxa never
  executes tools. The runtime status model mirrors the reusable event model: `not_started → ready
  → thinking → streaming → replied | error | expired`. The runtime event contract
  (`AgentRuntimeEvent`: `thinking`, `streaming`, `tool_start`, `tool_complete`,
  `response_complete`, `error`) lives in `app/lib/server/agents/runtime/types.ts` for a future
  real token-streaming transport / `ProductionRuntime` to emit. Current delivery uses the existing
  `/api/agents/sandbox*` routes.
- **Runtime registry merge seam** (`app/lib/agents/registry.ts`). Defines
  `RuntimeAgentDescriptor` with a `source` (`first_party` | `registered`) and a hard
  `availableInRooms` gate. `getFirstPartyRuntimeAgents()` (from the manifest; `availableInRooms`
  = manifest `available`), `getRegisteredRuntimeAgents(service)` (approved + verified DB agents,
  ALWAYS `availableInRooms: false`), `mergeRuntimeAgents()`, and `getRoomEligibleAgents()`.
  Nothing in room/selector code calls the merge yet — it exists so enabling DB agents in rooms
  is one deliberate change (flip the gate + add dispatch), not a rewrite.

- **Runnable sample agents** (`examples/agents/research-agent/`, `examples/agents/code-assistant/`).
  Minimal Node/TS HTTP servers (`GET /health`, `POST /voxa/handshake`, `POST /voxa/message`) built
  on `@voxa/sdk` (`createAgentHandshake`, `createAgentMessageResponse`) that report different
  capabilities + tools and return `streaming: true`. Run them on different ports (8787 / 8788),
  tunnel them, register the `…/voxa/handshake` URLs, get them approved + verified, then select both
  in the multi-agent sandbox. The SDK's `tsconfig` is `NodeNext` so its emitted ESM is
  Node-runnable; relative source specifiers carry `.js`. voxa-beta does not import `@voxa/sdk` (it
  keeps its own copy of the contract in `verification.ts`).

- **Experimental room visibility (Phase 3.9, feature-flagged).** Server-only flag
  `EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS` (default `false`, never `NEXT_PUBLIC`). When `false`
  (default) the live-room Agent Selector is unchanged. When `true`, the caller's OWN approved +
  verified external agents (`status=approved`, `verification_status=verified`, `endpoint_url` not
  null, `visibility` in private/unlisted — public excluded) are SHOWN in the selector under an
  "Experimental · Text-only developer agents" section. Read path: server-only
  `app/lib/server/agents/room-access.ts` (`externalAgentsInRoomsEnabled`,
  `getOwnRoomEligibleExternalAgents`) → `GET /api/agents/room-eligible` (returns
  `{ enabled: false, agents: [] }` when off) → browser `listRoomEligibleExternalAgents()`
  (best-effort, never throws → never breaks a room) → `AgentSelector`. Scoped to the caller's own
  agents (not admin-all) as the safer default.
- **Experimental text-only room mode (Phase 3.10).** When the flag is on, those external agents can
  be **invited into a live room in TEXT-ONLY mode**. Invite (`POST /api/agents/room/invite`) and
  messaging (`POST /api/agents/room/message`) both re-validate flag + ownership + approval +
  verification + endpoint + room membership on every call (server is the source of truth). Invite
  inserts a `room_participants` row via SERVICE ROLE (`app/lib/server/supabase-service.ts`) with
  `participant_type='agent'` and `user_id=agent:<agentId>` (`externalAgentParticipantId`) + a join
  event — NO dispatch/LiveKit/audio. Messaging sends ONLY the one user message via `RoomTextRuntime`
  (`app/lib/server/agents/runtime/RoomTextRuntime.ts`, `mode:"room_text"`, forces `sandbox:false`,
  context `{ roomId, agentId, mode:"room_text" }`) to the agent's endpoint and returns the text
  reply; **no room audio, no transcript, no auto-broadcast** of room messages. Rate-limited per user
  (20/min). Only the owner can message; the reply is returned to the caller and shown in the
  selector's compact text panel (the room participant card gets a "Text-only" badge). `SandboxRuntime`
  and `RoomTextRuntime` share the wire transport `runtime/voxaMessageClient.ts`; a future
  `ProductionRuntime` reuses the same `AgentRuntimeTransport` interface. External agents still NEVER
  speak, never join LiveKit, and never get audio/transcripts.
- **Per-agent room thread memory (Phase 3.11).** Each invited external agent gets its own
  room-local text thread stored in `room_events` (no schema change) under types
  `external_agent_user` / `external_agent_reply`, scoped by `user_id=agent:<agentId>` so each
  (room, agent) pair is isolated (`app/lib/server/agents/room-memory.ts`, written/read/deleted via
  SERVICE ROLE). On each `/api/agents/room/message` the route loads the last
  `EXTERNAL_AGENT_ROOM_MEMORY_TURNS` (default 10) turns for THAT room+agent and sends them as
  `context.history` (`[{role:"user"|"agent",text}]`); on success it persists the user message +
  reply, on failure it persists nothing (thread stays intact). History is strictly scoped — never a
  full room transcript, never other agents, never Nova memory, never audio. `GET/DELETE
  /api/agents/room/thread?roomId=&agentId=` read / **clear** one agent's thread (re-validating flag +
  ownership + approval + verification + membership + agent-in-room); the selector card shows the
  thread with timestamps + a **Clear thread** button (clears only that agent's rows). These rows are
  filtered out of the human event feed (`room-sync.ts`) and deleted on room close by the SECURITY
  DEFINER fn `cleanup_external_agent_room_memory(room_id)` (best-effort from `leaveSharedRoom`;
  hourly sweep is the backstop), preserving normal room events. Optional env
  `EXTERNAL_AGENT_ROOM_MEMORY_TURNS`.

**Still intentionally disabled:** external agents can only be invited in EXPERIMENTAL text-only mode
behind a default-off flag (no audio, no LiveKit, no transcript, owner-only, never speak); public
marketplace agents are never room-eligible; no billing or onchain identity; Nova Path A, wake word,
and Talk to Agent are unchanged.

## Key env (voxa-beta/.env.local — see voxa-beta/.env.example)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY`
(server-only — admin review API uses it to bypass RLS) and `ADMIN_EMAILS` (server-only,
comma-separated admin allowlist for `/admin/agents`); `EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS`
(server-only, default `false` — gates display-only external-agent visibility in the Agent
Selector); `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (server-only — never prefix LiveKit/Deepgram/
Gemini/OpenAI keys with `NEXT_PUBLIC`); `DEEPGRAM_API_KEY` (+ optional `DEEPGRAM_MODEL`
default `nova-3`, `DEEPGRAM_LANGUAGE` default `multi`); `GOOGLE_API_KEY` +
`GEMINI_MODEL` (+ optional `NOVA_MAX_OUTPUT_TOKENS` default 700, `NOVA_MEMORY_TURNS`
default 12 for session memory); `NOVA_TTS_PROVIDER`/`NOVA_TTS_VOICE`/`NOVA_TTS_SPEED`;
optional `OPENAI_API_KEY`/`OPENAI_TTS_MODEL`; `NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS`
(legacy, unused for capture length).
Wake word (browser-side, optional): `NEXT_PUBLIC_WAKE_WORD_ENABLED=false`,
`NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`,
`NEXT_PUBLIC_NOVA_WAKE_WORD`, `NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH`,
`NEXT_PUBLIC_PICOVOICE_MODEL_PATH` — the Picovoice AccessKey is intentionally
`NEXT_PUBLIC` (Porcupine runs in the browser); it is **not** a backend secret, and no
server secret should ever be `NEXT_PUBLIC`. Model files live in
`voxa-beta/public/picovoice/` (see its README). Agent env lives in
`voxa-agent/.env.local` (see its `.env.example`).

## Conventions

- `@/` path alias in both TS apps. TypeScript throughout. Tailwind v4 in `src/`, v3 in
  `voxa-beta/`.
- Secrets are server-only and error messages are sanitized of tokens/keys — keep it that way.
- Keep responses voice-friendly and concise in Nova prompts (system instruction lives in
  `gemini.ts` / `agent.py`).

## Landmines / current debt (verify before relying on these)

- **Security model = RLS, but policies aren't in the repo.** Highest-priority concern.
- **No rate limiting** on `/api/agents/nova/respond` — each call burns Deepgram + Gemini
  + TTS + a LiveKit connection.
- **Wake word**: an optional **browser-side** wake word now exists for Path A
  (`voxa-beta/app/lib/wake-word/`, Picovoice Porcupine Web, local-only, gated by
  `NEXT_PUBLIC_WAKE_WORD_ENABLED`). Picovoice trial/activation failures must degrade to
  "Wake word is temporarily unavailable" and keep Talk to Agent working. It is unrelated
  to — and does not revive — the stale "local wake word"
  comments in `voxa-agent/src/agent.py` (Path B), which remain inaccurate.
- **Everything hardcodes the single agent "nova"** (DB rows with `user_id = "nova"`,
  route names, provider names). A foundational `Agent` abstraction and static first-party
  manifest now exist, but most behavior still runs through the Nova-specific Path A
  pipeline.
- **`@livekit/rtc-node` uses native FFI** — confirm the deploy target (likely NOT Vercel
  serverless; needs a long-running Node host/container).
- **Verify model IDs resolve** (`GEMINI_MODEL`, the agent's Gemini Live model) before
  relying on them in production.
- `src/voxa/*` is mock UI; the real product is `voxa-beta`. Three root docs
  (`IMPLEMENTATION_SUMMARY.md`, `MOBILE_IMPROVEMENTS.md`,
  `NON_ESSENTIAL_FEATURES_REMOVAL.md`) describe an older "cinematic voice rooms" spec and
  are partly stale.

## Doing tasks

- **Before every significant code change**, keep docs in sync:
  - update `README.md` (the relevant project's) if setup or behavior changes,
  - update this `CLAUDE.md` if architecture changes,
  - keep env docs synchronized across `.env.example`, `.env.local`, and the READMEs.
- Don't introduce backwards-compat shims or speculative abstractions; don't create docs
  unless asked.
- Confirm before risky/irreversible actions (DB migrations, pushes, deploys, deleting the
  mock SPA).
- When in doubt, choose the implementation that generalizes Voxa from "Nova demo" toward
  "agent runtime."
