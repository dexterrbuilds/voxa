# Voxa App Setup

## Current Hardening Pass

- `/developers/agents`: paste a handshake endpoint, **Test connection**, inspect reported
  capabilities and explicitly apply detected metadata. Detection never grants permissions,
  verifies ownership, approves, publishes, or registers an agent automatically.
- `/api/agents/discover`: authenticated, rate-limited, 5-second bounded probe. Shared outbound
  transport validates public DNS, pins the socket address, rejects redirects/private targets,
  and bounds response bytes. Local agents need an HTTPS tunnel.
- Sandbox messages use NDJSON to deliver each completed reply independently. This is **not
  token streaming**. Artificial word-by-word delays were removed. Stop/reset/unmount cancel
  pending work; a slow agent does not block a different idle agent.
- Room text messages have request IDs, per-process in-flight coordination, retry/stop states,
  and late-response guards. Context is permission-filtered, at most 12 turns / 12,000 characters
  (default DB load remains 10 turns). Room identity is whitelisted; no profiles or room transcript
  are added. Human mic and Nova Path A behavior are unchanged.
- Room refresh requests are coalesced; room, participants, and recent events load in parallel.
  Polling stays at 3 seconds, and online recovery triggers a refresh.
- Public showcase identity comes only from opted-in developer profiles, never auth emails.
  Planned first-party agents are marked Coming soon rather than Verified.

### Analytics Migration

Run `supabase-agent-analytics-server-writes.sql` **after the existing analytics schema**.
It preserves counters and owner-only RLS while revoking browser RPC execution and granting
it only to `service_role`. Deploy alongside the new analytics helper. Existing
`SUPABASE_SERVICE_ROLE_KEY` must be configured server-side; missing analytics configuration
must not break agent responses. No new secrets or flags are required.

### Regression Checks

```sh
npx tsc --noEmit
npm run build
npm run lint
node --require ./tests/register.cjs --test tests/runtime.test.cjs tests/routes.test.cjs
```

`tests/browser-smoke.mjs` uses Playwright against `SMOKE_URL` (default localhost:3100).
It tests actual rendered pages with **controlled auth/provider fixtures**, not production
account writes. `tests/analytics.sql` is for an **empty disposable PostgreSQL database only**,
never a Supabase project. See [full validation and limits](../docs/platform-hardening.md).

## Supabase Email Authentication

Voxa uses Supabase Auth. Email/password is the active sign-in path for local product testing.

Create `voxa-beta/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
# Server-only. Used by the admin agent review API to bypass RLS. Never NEXT_PUBLIC.
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# Server-only. Comma-separated admin emails allowed into /admin/agents. Never NEXT_PUBLIC.
ADMIN_EMAILS=admin@example.com,reviewer@example.com
LIVEKIT_URL=your_livekit_cloud_url
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS=10000
NEXT_PUBLIC_NOVA_SILENCE_TIMEOUT_MS=2000
NEXT_PUBLIC_NOVA_MAX_RECORDING_MS=15000
NEXT_PUBLIC_NOVA_SILENCE_THRESHOLD=0.015
DEEPGRAM_API_KEY=your_deepgram_key
DEEPGRAM_MODEL=nova-3
DEEPGRAM_LANGUAGE=multi
GOOGLE_API_KEY=your_google_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
NOVA_MAX_OUTPUT_TOKENS=700
NOVA_MEMORY_TURNS=12
NOVA_TTS_PROVIDER=edge
NOVA_TTS_VOICE=en-US-JennyNeural
NOVA_TTS_SPEED=1.15
OPENAI_API_KEY=optional_openai_tts_fallback_key
OPENAI_TTS_MODEL=gpt-4o-mini-tts

# Optional wake-word activation (Picovoice Porcupine Web, browser-side)
NEXT_PUBLIC_WAKE_WORD_ENABLED=false
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=your_picovoice_access_key
NEXT_PUBLIC_NOVA_WAKE_WORD=Nova
NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH=
NEXT_PUBLIC_PICOVOICE_MODEL_PATH=/picovoice/porcupine_params.pv
```

In Supabase:

1. Open Authentication -> Providers.
2. Enable Email.
3. Enable email confirmations so new users verify their email before logging in.
4. Add these redirect URLs in Authentication -> URL Configuration -> Redirect URLs:
   - `http://localhost:3000/login?verified=true`
   - `http://localhost:3000/auth/callback`
   - your deployed app login URL, for example `https://beta.usevoxa.vercel.app/login?verified=true`

Google sign-in remains visible in the UI, but it is intentionally not the active test path yet.

## Public Agent Showcase

The product app exposes a public showcase:

- `/agents`
- `/agents/[slug]`

It displays first-party profiles plus public external agents that are all of:

- `status = approved`
- `verification_status = verified`
- `visibility = public`

The query layer (`app/lib/server/agents/showcase.ts`) runs server-side and maps records to a
safe public view model. It exposes only avatar, name, slug, description, creator display
name, capabilities, safe permissions, tags, verification status, and updated date. It never
returns `endpoint_url`, `creator_user_id`, internal metadata, admin notes, review notes,
verification reports, or internal-only fields.

This is a developer-preview discovery surface, not a marketplace. There are no installs,
public room invites, billing, reviews, rankings, payments, or runtime changes. If
`SUPABASE_SERVICE_ROLE_KEY` is missing, the page still renders first-party fallback profiles.

## Nova Pipeline

Nova uses a decoupled tap-to-talk pipeline for MVP control and cost:

```http
POST /api/agents/nova/respond
```

The endpoint:

- requires a signed-in Supabase user
- verifies the user is a human participant in the room
- verifies Nova is present in the room
- transcribes the captured audio with Deepgram (multilingual by default)
- loads recent room conversation as short-term memory (see below)
- generates a Nova response with Gemini Flash-Lite, including that history
- synthesizes an MP3 response with Edge TTS
- publishes the synthesized response into the LiveKit room as Nova
- stores the user prompt + Nova reply back into session memory
- returns playback metadata, transcript, and response text
- returns a text response with `audioUnavailable: true` if TTS is unavailable

Provider logic lives under `app/lib/server/nova/` so Deepgram, Gemini, Edge TTS, or OpenAI TTS can be swapped later. Set `NOVA_TTS_PROVIDER=openai` to use OpenAI TTS directly, or leave `NOVA_TTS_PROVIDER=edge` and set `OPENAI_API_KEY` for automatic fallback if Edge TTS fails in production.

## Agent Runtime Foundation

Voxa is moving from a single-agent Nova demo toward a general runtime for
conversational AI agents. The foundation for that runtime lives in:

```text
app/lib/runtime/
  types.ts
  Agent.ts
  AgentRegistry.ts
  AgentRuntime.ts
  index.ts

app/lib/agents/nova/
  NovaAgent.ts
  index.ts

app/lib/agents/manifest.ts
```

The runtime layer defines the shared agent contract: identity, status, capabilities,
messages, responses, registry, and dispatch surface. Nova is represented as the first
first-party agent with capabilities for voice, memory, multilingual understanding, web
search, and realtime room participation.

The agent manifest exposes:

- `getAvailableAgents()`
- `getAgentById(agentId)`
- `isFirstPartyAgent(agentId)`
- `getDefaultAgent()`
- `getAgentParticipantUserId(agentId)`

Only Nova is registered today. Room and lobby UI now read safe agent display metadata
from the manifest so the product can move toward agent selection later.

Manifest entries include `availability`, `category`, `shortLabel`, and `tags`. Nova is
the only `available` agent. Research Agent, Meeting Summarizer, and Code Assistant are
registered as `coming_soon` placeholders so the UI can show the first-party platform
direction without enabling backend behavior.

Legacy compatibility remains intentional: Supabase `room_participants.user_id` still
stores the agent id (`"nova"` for Nova). Do not migrate this casually. The future schema
should add a dedicated agent identity column and a DB-backed agent registry.

### Generic invite flow

Room code now exposes a generic first-party invite path:

- `useRoomStore().inviteAgent(roomId, agentId)` for local/session fallback
- `inviteAgentToSharedRoom(roomId, agentId)` for Supabase shared rooms
- `useRoom().inviteAgentShared(roomId, agentId)` for app screens

`inviteNova` and `inviteNovaShared` remain as compatibility wrappers that call the
generic path with `agentId = "nova"`. Current UI can keep using Nova-specific labels,
but internal room logic is ready for future multi-agent selection.

The generic path validates the agent against the manifest and uses
`getAgentParticipantUserId(agentId)` before writing to `room_participants.user_id`.
For Nova that still resolves to `"nova"`.

### Agent registration API scaffold

Future developer-owned agents have a safe metadata intake scaffold:

- `POST /api/agents/register`
- `GET /api/agents`
- `GET /api/agents/:id`
- `PATCH /api/agents/:id`

All routes require an authenticated Supabase bearer token. They only let a developer
create/list/read/update their own draft or pending-review records. They reject public
visibility and self-approved statuses, so submitted agents cannot appear in rooms,
marketplace surfaces, or the Agent Selector yet.

Run `supabase-agent-registration-schema.sql` in Supabase SQL Editor to create the
additive `public.agents` table and owner-scoped RLS policies. This schema does **not**
change `room_participants` or the current Nova compatibility row
(`room_participants.user_id = "nova"`). A later migration should add a proper DB-backed
agent registry and dedicated agent identity fields.

### Developer agent registration dashboard (`/developers/agents`)

`app/developers/agents/page.tsx` is the authenticated developer UI for the scaffold above.
It requires a signed-in Voxa user (otherwise it shows a sign-in CTA and redirects to
`/login?next=/developers/agents`) and uses the browser-side client
`app/lib/agents/registry-client.ts` to call the `/api/agents/*` routes with the user's
Supabase bearer token.

Developers can:

- register an agent (name, slug, description, endpoint URL, avatar URL, capabilities,
  permissions, tags, visibility, submission status, optional JSON metadata),
- see a list of their own submissions with name, slug, status, visibility, capabilities,
  and created/updated dates (empty state: "No agents registered yet."),
- edit their own `draft` / `pending_review` records (other statuses render "Locked").

The form mirrors backend limits in the UI: status is limited to `draft` / `pending_review`,
visibility to `private` / `unlisted` (no public publishing), and there is no self-approval.
Capabilities/permissions/tags are comma-separated; metadata is validated as a JSON object.
API errors (validation, duplicate slug `409`, unauthorized `401`, storage-not-ready `503`)
surface as readable messages — no raw stack traces.

A persistent banner states that **registered agents are not available in live rooms until
reviewed and approved**, and the page links to the developer docs and SDK docs. Submitted
agents stay registration-only: they do not feed `AgentSelector` and cannot be invited into
rooms until approval tooling and a DB-backed runtime registry exist.

### Bring Your Own Agent / self-import

Developers can import an **existing** agent from another runtime — **OpenClaw**, LangChain,
CrewAI, AutoGen, or other — through the same registration form. Importing is **not** automatic
access: it never bypasses review, verification, sandbox, permissions, or room gating, and
imported runtimes are **not trusted by default**.

- **Model** (additive, `supabase-agent-import-schema.sql`): `import_source` (default
  `custom_endpoint`) + `import_metadata jsonb` (optional repository / docs URLs — internal).
  The source model lives in `app/lib/agents/import-sources.ts`.
- **Dashboard:** a **Source / runtime** selector, optional repository / docs URLs, a per-source
  adapter note, and a standing security panel: Voxa never runs your tools (only explicit user
  messages are sent), imports are reviewed + sandboxed before any room use, they get no room
  audio or transcript, and OpenClaw/public runtimes are not trusted by default.
- **Adapter contract:** an imported agent wraps its runtime behind the **same** Voxa endpoints
  (`GET /health`, `POST /voxa/handshake`, `POST /voxa/message`, optional `POST /voxa/voice`).
  The adapter maps `Voxa request → upstream runtime → Voxa response`. A mock lives at
  [`examples/agents/openclaw-adapter`](../examples/agents/openclaw-adapter) (no real OpenClaw
  credentials required).
- **Verification: no bypass** — imports still require endpoint reachable + valid handshake +
  compatible SDK/protocol + declared capabilities + admin approval.
- **Showcase:** public agent cards/detail show a friendly provenance label ("Native Voxa
  Agent", "Custom Endpoint", "Imported from OpenClaw", …). Endpoint URLs and internal metadata
  are never exposed.

### Agent analytics (`/developers/agents`)

The developer dashboard includes owner-scoped usage analytics for each registered agent.
This is visibility only — **not** billing, metering, monetization, quotas, pricing, token
accounting, subscriptions, or revenue sharing.

Apply the additive SQL before expecting counters to persist:

```text
supabase-agent-analytics-schema.sql
```

The schema creates `public.agent_analytics` with one aggregate row per agent and the
SECURITY DEFINER RPC `increment_agent_analytics(...)`. Developers can select only their
own analytics rows. Counter increments are server-side only and happen after existing
route validation succeeds; the client never directly increments usage.

Tracked fields:

- `sandbox_sessions_started`
- `sandbox_messages_sent`
- `room_invites`
- `room_messages_sent`
- `last_active_at`

Recording points:

- `POST /api/agents/sandbox` — one session increment for each selected sandbox agent.
- `POST /api/agents/sandbox/message` — one message increment for each runnable target.
- `POST /api/agents/room/invite` — one invite increment only when a new room participant
  is inserted.
- `POST /api/agents/room/message` — one room-message increment only after a successful
  text-agent reply.

`GET /api/agents` and `GET /api/agents/:id` include analytics for the authenticated
developer's own agents. Public `/agents` showcase routes never expose analytics.

### Developer profiles (`/developers/[username]`)

Developers can complete a lightweight public identity from the existing
`/developers/agents` dashboard. Public pages live at `/developers/[username]` and show the
developer's safe profile fields plus approved, verified, public agents they created.

Apply the additive SQL before saving profiles:

```text
supabase-developer-profiles-schema.sql
```

The schema creates `public.developer_profiles` with:

- `username`
- `display_name`
- `bio`
- `avatar_url`
- `website`
- `x_handle`
- `joined_at`

Authenticated profile editing uses `GET/PATCH /api/developers/profile` with the user's
Supabase bearer token and owner-scoped RLS. Public profile rendering uses the server-side
helper `app/lib/server/developers/profile.ts`, maps only safe fields, and never exposes
emails, Supabase user ids, auth metadata, endpoint URLs, internal metadata, admin notes,
review notes, verification reports, or analytics.

Public agent detail pages show **Built by {Developer}** as a clickable link when the
creator has completed a profile. The `/agents` directory includes a simple Featured
Developers section derived from public agents. This is not a social network: there is no
following, messaging, likes, ratings, comments, or payments.

### Admin agent review (`/admin/agents`)

An admin-only review console moves submitted agents through the approval lifecycle.

**Admin auth model:** there is no role table yet. Admins are defined by the server-only
`ADMIN_EMAILS` env var (comma-separated). A request is admin if its authenticated Supabase
email is in that list. The developer routes use the anon client + the user's bearer token
(RLS-scoped to their own records), but admins must read other users' agents and set statuses
RLS blocks — so the **admin routes authenticate the caller against `ADMIN_EMAILS`, then use a
service-role client (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS**. Both vars are server-only
and never exposed to the client.

API routes (`runtime = "nodejs"`):

- `GET /api/admin/agents` — list all submitted agents (`draft`, `pending_review`, `approved`,
  `rejected`, `disabled`), newest first, with optional `?status=` filter. Resolves creator
  emails best-effort via the service-role admin API.
- `PATCH /api/admin/agents/:id/review` — body `{ action, note? }`. Allowed transitions:
  `pending_review → approved` (approve), `pending_review → rejected` (reject),
  `approved → disabled` (disable), `disabled → approved` (approve),
  `rejected → pending_review` (return_to_review). Anything else returns `409`. Writes
  `reviewed_by`, `reviewed_at`, `review_note`.

Non-admins get a clean `403` (`not_admin`); unauthenticated callers get `401`. The page
`app/admin/agents/page.tsx` (browser client `app/lib/agents/admin-client.ts`) is an
authenticated dashboard with status filters, full agent detail (name, slug, description,
creator email/id, endpoint, capabilities, permissions, tags, visibility, metadata,
created/updated/review dates) and Approve / Reject / Disable / Return-to-review actions gated
by the current status. A `403` renders an "Admin access required" state.

**Approval is review-only:** approving an agent does **not** add it to `AgentSelector` or let
it join rooms. External agents stay out of live rooms until a DB-backed runtime registry is
intentionally enabled.

Apply `supabase-agent-review-schema.sql` in the Supabase SQL Editor to add the additive
`reviewed_by` / `reviewed_at` / `review_note` columns (and a review-queue index) before using
the review actions. Until applied, the API returns a `503` "review storage is not ready" hint.

### Agent verification & developer sandbox

This phase prepares external agents for testing **without** allowing them into production
rooms.

**Verification axis.** `supabase-agent-verification-schema.sql` adds a `verification_status`
column (`verification_pending` default → `verified` / `verification_failed`) plus `verified_at`,
`verification_note`, and a `verification_report` JSON column. Verification is independent of the
review `status`: an agent can be approved and still need its endpoint verified.

**Endpoint health check** (`app/lib/server/agents/verification.ts`). `runAgentVerification` POSTs
`{ type: "voxa.handshake" }` to the agent's `endpoint_url` (5s timeout) and runs three checks:

1. `endpoint_reachable` — the endpoint answers the handshake,
2. `sdk_compatible` — protocol is `voxa-agent` and the SDK version is supported,
3. `capability_payload` — declared capabilities are covered by what the endpoint reports.

The handshake contract mirrors `@voxa/sdk`'s `createAgentHandshake()`. Admins run it via
`POST /api/admin/agents/:id/verify` (service-role), and the `/admin/agents` page has a "Verify
endpoint" button, a verification badge, and the stored report. Run
`supabase-agent-verification-schema.sql` first; otherwise the API returns a `503`.

**Developer sandbox** (`POST /api/agents/sandbox`, page `/developers/sandbox`). A developer can
start an **isolated** sandbox session only for their **own** agent that is BOTH `approved` AND
`verified`. The session returns a namespaced sandbox room id (`sandbox:<agentId>:<uuid>`, 30-min
TTL, `runtimeReady: false`).

**Sandbox messaging is live** (`POST /api/agents/sandbox/message`). The sandbox chat sends
`{ sandboxSessionId, message, targetAgentId?, broadcast? }`; the route re-validates ownership +
approval + verification (the session is stateless — the agent ids are parsed from the session id
and re-checked against the DB every call), then the `SandboxRuntime` POSTs the SDK `voxa.message`
contract (`{ type: "voxa.message", message, context: { sandbox: true } }`) to each agent's message
endpoint (derived from the registered handshake URL: `…/voxa/handshake` → `…/voxa/message`) and
returns a `replies[]` array (`{ agentId, agentName, ok, reply | error }`). Calls are rate-limited
per user (30/min, `429` on excess; one increment per request, even for a broadcast). This still
does **not** create a production room/participant, mint a LiveKit token, or place the agent in a
room — it is a direct, isolated server-to-endpoint call. `runtimeReady` stays `false`.

**Multi-agent sandbox sessions (Phase 3.8).** A sandbox session can reference one OR MORE of the
caller's own approved + verified agents. `POST /api/agents/sandbox` accepts `{ agentIds: string[] }`
(legacy `{ agentId }` still works), validates **every** selected agent (owned, approved, verified,
has an endpoint), and returns a session whose id encodes all agent ids
(`sandbox:<id1>,<id2>:<uuid>`, max 5 agents) plus an `agents` summary array. Messaging routes by
`targetAgentId` (one agent — must belong to the session), `broadcast: true` (all session agents,
fanned out by `SandboxRuntime.broadcastMessage`, each result independent), or neither (defaults to
the first/active agent). The `/developers/sandbox` page lets a developer multi-select eligible
agents, start a session, pick the active agent via pills, and use **Send to {agent}** or **Send to
all** — each agent reply is labeled and streamed independently with its own Tools Used panel. This
is **sandbox-only**: it is not a production multi-agent room, agents never join the Agent Selector
or live rooms, and `runtimeReady` stays `false`.

The transport lives behind a reusable interface: `app/lib/server/agents/runtime/` defines
`AgentRuntimeTransport` (`sendMessage` / `sendMessageToAgent` / `broadcastMessage`), and
`SandboxRuntime` is the only implementation today (`broadcastMessage` fans one message out to many
endpoints in parallel). A future `ProductionRuntime` will implement the same interface (adding
room/LiveKit dispatch) — it does not exist yet.

**Sandbox runtime v2 UI.** `/developers/sandbox` is a mini runtime environment, not just a chat
box. Per agent it shows an **agent metadata panel** (name, slug, status, verification, endpoint,
capabilities, permissions, tags) with a standing "Sandbox only — not available in live rooms yet."
notice, a **runtime status** indicator (`Not started → Ready → Sending → Agent replied → Error →
Expired`), and a **conversation** with per-turn timestamps, a **Reset conversation** button, and
**session-expiry** handling: the panel watches `expiresAt`, switches to an Expired state, and lets
the developer start a fresh session. Message UX: Enter to send, Shift+Enter for a newline, empty
messages are blocked, send is disabled while a reply is pending, and agent/endpoint errors render
inline. History is component-local state (not persisted). None of this changes the API or grants
production-room access.

**Streaming + tool simulation (v3).** The message reply may include optional `streaming: true` and
a `tools` array (`{ name, status, detail? }`). When `streaming` is set, the sandbox shows
"{agent} is thinking…" then reveals the reply word-by-word — a **client-side simulation**, not SSE
or a websocket. Reported `tools` render as a read-only **"Tools Used"** panel (✓ per tool); Voxa
never executes tools. `SandboxRuntime` parses both fields defensively and the message route passes
them through. The runtime status model (`Not started → Ready → Thinking → Streaming → Agent replied
→ Error → Expired`) mirrors the reusable `AgentRuntimeEvent` contract
(`thinking`/`streaming`/`tool_start`/`tool_complete`/`response_complete`/`error`) in
`app/lib/server/agents/runtime/types.ts`, which a future real streaming transport / `ProductionRuntime`
will emit. Still no production-room access.

**Runtime registry preparation** (`app/lib/agents/registry.ts`). A merge seam combines two agent
sources into `RuntimeAgentDescriptor`s tagged with `source` (`first_party` | `registered`) and a
hard `availableInRooms` gate. First-party `available` agents are room-eligible; registered DB
agents (approved + verified) are merged for visibility but **always** `availableInRooms: false`.
No room/selector code calls the merge yet — enabling DB agents in rooms is a single deliberate
change later, not a rewrite.

### Experimental external-agent room visibility (feature-flagged, display-only)

A **server-only** flag, `EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS` (default `false`, never
`NEXT_PUBLIC`), gates whether approved + verified external agents are *shown* in the live-room
Agent Selector. This is **display-only** — chosen for safety (Option A).

- **Flag off (default):** the Agent Selector is unchanged. No external agents appear.
- **Flag on:** the caller's **own** agents that are `approved` + `verified` + have an
  `endpoint_url` + are `private`/`unlisted` (public excluded) appear under an
  "Experimental · Text-only developer agents" section. Scoped to the caller's own agents (not
  admin-all).

Read path: `app/lib/server/agents/room-access.ts` (`externalAgentsInRoomsEnabled`,
`getOwnRoomEligibleExternalAgents`) → `GET /api/agents/room-eligible` (returns
`{ enabled: false, agents: [] }` when the flag is off) → browser
`listRoomEligibleExternalAgents()` (best-effort; any failure resolves to empty so a room never
breaks) → `AgentSelector`.

#### Experimental text-only room mode

When the flag is on, those external agents can be **invited into a live room in text-only mode**:

- **Invite** — `POST /api/agents/room/invite { roomId, agentId }`. Re-validates flag + ownership +
  approval + verification + endpoint, confirms the caller is a human room member, then inserts a
  `room_participants` row via the **service role** (`participant_type='agent'`,
  `user_id=agent:<agentId>`) + a join event. No dispatch, no LiveKit, no audio.
- **Message** — `POST /api/agents/room/message { roomId, agentId, message }`. Re-validates the same
  checks + room membership + that the agent is in the room, rate-limits per user (20/min), loads the
  agent's per-room thread, then sends the message + scoped history through `RoomTextRuntime` (context
  `{ sandbox:false, roomId, agentId, mode:"room_text", history }`) and returns the `{ text }` reply.
  Only the owner can message; no room transcript is ever sent, and room messages are never
  auto-broadcast to the agent.

#### Per-agent room thread memory (Phase 3.11)

Each invited external agent has its own **room-local text thread** so follow-ups carry recent
context. Stored in the existing `room_events` table (no schema change) under types
`external_agent_user` / `external_agent_reply`, scoped by `user_id=agent:<agentId>` — one isolated
thread per (room, agent), written/read/deleted via the **service role**
(`app/lib/server/agents/room-memory.ts`).

- **Context** — each message loads the last `EXTERNAL_AGENT_ROOM_MEMORY_TURNS` (default 10) turns
  for that room + agent and sends them as `context.history` (`[{ role:"user"|"agent", text }]`).
  Strictly scoped: **never** a full room transcript, other agents' threads, Nova memory, or audio.
- **Persist** — on a successful reply the user message + reply are saved; on endpoint failure
  nothing is saved (the thread is not corrupted).
- **Read / clear** — `GET` / `DELETE /api/agents/room/thread?roomId=&agentId=` (same full security
  posture). The selector card loads the thread (with timestamps) and offers a **Clear thread**
  button that deletes **only** that agent's rows — never room events, Nova memory, or other agents.
- **Cleanup** — on room close (`leaveSharedRoom`) the SECURITY DEFINER fn
  `cleanup_external_agent_room_memory(room_id)` deletes only the `external_agent_*` rows for that
  room (best-effort; the hourly `cleanup_expired_voxa_rooms` sweep is the backstop), preserving
  normal room events. These rows are filtered out of the human-facing event feed.

`SandboxRuntime` and `RoomTextRuntime` are separate `AgentRuntimeTransport` implementations that
share one wire client (`app/lib/server/agents/runtime/voxaMessageClient.ts`); a future
`ProductionRuntime` reuses the same interface. The Agent Selector shows an enabled "Invite
(text-only)" button and a compact per-agent thread; the room participant card gets a "Text-only"
badge.

#### Room thread UI (Phase 3.12 polish)

The in-room per-agent thread is a polished, mobile-friendly chat: compact message bubbles with
per-turn timestamps, an empty state, and a live status label on the agent card — **In Room** →
**Thinking** (awaiting the endpoint) → **Responding** (revealing) → **Error**, alongside the
standing **Text-only** label.

- **Simulated streaming** — if a reply sets `streaming: true`, the text is revealed
  progressively (UI-only word-by-word, no SSE/websocket).
- **Tools Used** — if the reply reports `tools`, a compact "Tools Used" panel renders under the
  bubble, matching the sandbox display. Voxa never executes tools.
- **Retry** — if an endpoint call fails, the user message stays and a **Retry** action resends the
  **same** message. Nothing is persisted on failure, and retry does not duplicate memory rows (the
  server persists only on success).
- **Copy** — each agent reply has a **Copy** button with a "Copied" confirmation.

All of this is client-side over the existing `/api/agents/room/message` + `/api/agents/room/thread`
routes — still no audio, no transcript, no LiveKit.

#### External-agent permissions & capability enforcement (Phase 3.13)

External agents carry a small, typed permission set (`app/lib/agents/permissions.ts`) that gates what
they may do in a room. The model is the single source of truth shared by the server (enforcement)
and the UI.

**Currently grantable** (and the minimal defaults a new agent gets):

| Permission             | Room badge     | What it allows                                              |
| ---------------------- | -------------- | ---------------------------------------------------------- |
| `room_text_reply`      | Text reply     | Reply to a typed room message. **Required** for chat.      |
| `memory_read_thread`   | Thread memory  | Include the recent per-agent thread as follow-up context.  |
| `memory_write_thread`  | Thread memory  | Persist the message + reply to its own thread.             |
| `tools_visualize`      | Tools display  | Report which tools it used (display only).                 |
| `room_presence`        | Room presence  | Appear as a participant card.                              |

**Future — types only, never grantable today:** `room_audio_listen`, `room_audio_speak`,
`room_transcript_read`. These exist in the type so the model is complete, but they are **not
selectable** in the dashboard, **not approvable** by admins, and **never effective** at runtime.

**Server-side enforcement** (never trusts the client) lives in `/api/agents/room/message`:

- Effective permissions = the agent's registered permissions ∩ grantable. Future permissions are
  always dropped here. Legacy/empty agents fall back to the minimal default set.
- `room_text_reply` is **required** — missing → `403 permission_denied`.
- `memory_read_thread` gates loading thread history (omitted if not granted — no error, never a
  transcript).
- `memory_write_thread` gates persisting the exchange (skipped if not granted).
- `tools_visualize` gates returning tools (stripped if not granted).
- **Capability enforcement:** any reported tool whose name is not in the agent's registered
  `capabilities` is marked `untrusted` (kept for display, flagged in the UI) rather than trusted.
- Permissions are also sanitized at registration (`sanitizeRequestedPermissions`) so future
  permissions are never even stored.

The dashboard (`/developers/agents`) shows permissions as friendly checkboxes (defaults pre-checked,
`room_text_reply` required, future permissions shown disabled as "coming soon"). The admin console
(`/admin/agents`) shows requested permissions split into **Granted** vs **Blocked** (future
permissions struck through, "never granted"). The room card shows friendly **Allowed** badges
(Text reply / Thread memory / Tools display). No audio/transcript powers are added.

**Room safety:** external agents are **never** dispatched to LiveKit, **never** publish audio,
**never** receive room audio or transcripts, and **never** speak. The sandbox + this text-only mode
are the only places they execute, both behind the default-off flag. Nova Path A, wake word, Talk to
Agent, room sync, and LiveKit are untouched.

#### Private voice agent beta (Phase 4.0)

A **highly restricted, push-to-talk** voice bridge for external agents. It is **not** room audio:
the agent never joins LiveKit, never gets a room audio stream, never gets a transcript, and never
auto-listens. Voice is always user-initiated, one captured clip per tap, played back to the
**initiating user only**.

**Two gates** (both required):

- Server-only flag `EXPERIMENTAL_EXTERNAL_AGENT_VOICE=false` (also requires
  `EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS=true`). Never `NEXT_PUBLIC`.
- An **admin-granted** `room_voice_beta` permission on the agent. This permission is **not**
  developer-requestable, **not** selectable in the dashboard, and is stripped from registration
  payloads (`sanitizeRequestedPermissions`). It can only be granted from the admin console
  (`PATCH /api/admin/agents/:id/permissions`, "Grant voice beta"). It is admin-grantable but a real
  effective permission (`ADMIN_GRANTABLE_EXTERNAL_AGENT_PERMISSIONS`).

**Flow** (`POST /api/agents/room/voice`, multipart audio + roomId + agentId):

```
User taps "Talk to {agent}" → silence-bounded clip (its OWN mic stream)
  → Deepgram STT (reused Nova provider)
  → VoiceAgentRuntime POSTs { type:"voxa.voice", message:<transcript>, context:{mode:"voice_beta",roomId,agentId,history} }
  → agent returns { text, voice? }
  → Edge/OpenAI TTS (reused Nova provider) → audio
  → returned as base64 and played LOCALLY in the user's browser
  → transcript + reply persisted into the SAME per-agent thread (no separate transcript system)
```

`VoiceAgentRuntime` (`app/lib/server/agents/runtime/VoiceAgentRuntime.ts`) is **separate** from
`SandboxRuntime` and `RoomTextRuntime` but shares the wire client (parameterized `type`). Client
capture lives in `app/lib/agents/voice-capture.ts` — entirely separate from `RoomVoice.tsx` / Nova
Path A, using its own `getUserMedia` stream (never the LiveKit room mic) and local `<audio>`
playback.

**Every voice request re-validates** flag + ownership + approval + verification + room membership +
agent-in-room + `room_voice_beta`. Rate-limited per user (10/min, stricter than text). The agent's
`voice.preferredVoice` is accepted in the contract but **not honored yet** — the configured default
Nova TTS voice is always used (TODO: future approved per-agent voice profiles). Capability vocabulary
adds `voice_input`/`voice_output`; `room_audio_listen`/`room_audio_speak` remain future-blocked.

The Agent Selector shows a **Voice Beta** badge and a **"Talk to {agent}"** push-to-talk button
(only when the flag is on and the agent has `room_voice_beta`). Text chat + thread memory keep
working unchanged — voice is purely additive.

### Agent Selector UI

`app/components/AgentSelector.tsx` renders the first-party agents from
`getAvailableAgents()`. The room sidebar uses it as the compact invite surface instead
of a hardcoded Nova invite card.

Today only Nova is inviteable. Coming-soon entries render disabled with a "Coming soon"
button and never call `inviteAgent`. The selector displays agent name, description,
capabilities, and invited/in-room state, then calls the generic invite path with
`agent.id` only for available agents. Future first-party agents can become active by
changing their manifest availability and wiring their runtime/backend path.

This is foundation only. The working Nova voice experience still uses the active Path A
pipeline:

```text
RoomVoice.tsx -> POST /api/agents/nova/respond -> Deepgram -> Gemini -> TTS -> LiveKit playback
```

Do not remove or bypass that pipeline until a later migration explicitly wires runtime
dispatch into product behavior.

### Short-term session memory

Nova keeps the room's topic in mind across turns. Each user prompt and Nova reply is
persisted to the existing `room_events` table under dedicated `type` values
(`nova_user`, `nova_reply`) by `app/lib/server/nova/memory.ts`. On each turn the route
loads the last `NOVA_MEMORY_TURNS` messages (default 12, ≈6 exchanges) and passes them to
Gemini as conversation history, so follow-ups like "tell me more about that" resolve
correctly. These rows are filtered out of the human-facing room event feed.

This is **session memory only** — it lives for the life of the room and is per-room.
There is **no long-term or cross-room memory** yet. When the room closes (the last
human leaves), the `nova_user`/`nova_reply` rows are deleted by the SECURITY DEFINER
function `cleanup_nova_room_memory(room_id)`, invoked best-effort from
`leaveSharedRoom` in `app/lib/room-sync.ts` (normal room events — joins, leaves,
notices — are preserved). The hourly `cleanup_expired_voxa_rooms` sweep removes all
remaining room data as a backstop. If the cleanup function is not yet installed in
Supabase, leaving still succeeds and the hourly sweep clears the memory.

### Response length

`NOVA_MAX_OUTPUT_TOKENS` (default 700) caps a reply. Nova stays concise by default but
gives a fuller answer when the user asks for detail, and is instructed not to cut off
mid-thought. Both Edge and OpenAI TTS synthesize the full response.

### Multilingual understanding

Deepgram runs with `DEEPGRAM_LANGUAGE=multi` (nova-3) by default, so users are not forced
to speak English — speech in other languages is auto-detected and transcribed. Nova's
system prompt instructs her to reply in the user's language. Set `DEEPGRAM_LANGUAGE=en`
to force English-only. Note: the default Edge TTS voice (`en-US-JennyNeural`) is an
English voice; for the best non-English speech output, use `NOVA_TTS_PROVIDER=openai`
(multilingual) and/or set `NOVA_TTS_VOICE` to a matching locale voice.

### Room microphone

The human room mic is independent of agent capture. You join muted once by default; after
that the mic **stays in whatever state you choose** — talking to an agent never auto-mutes
it. Agent capture uses its own microphone stream and never toggles the LiveKit room mic.

## Nova Activation (call-to-wake by default)

**Talk to Agent is the reliable manual activation path.** Optional call-to-wake
("Hey Nova") can be enabled with `NEXT_PUBLIC_WAKE_WORD_ENABLED=true` when a valid
Picovoice AccessKey is available. Wake detection uses
[Picovoice Porcupine Web](https://picovoice.ai/docs/porcupine/) and runs **entirely in
the browser**; the wake-listening audio never reaches the backend. If the flag is false,
the app skips Picovoice entirely and shows "Wake word is temporarily unavailable."

The human mic controls and agent voice controls live in a fixed, glassy bottom panel on
room screens. The panel uses mobile safe-area padding and the room layout reserves bottom
space so participant cards and room events are not covered. Users can always reach:

- **Talk to Agent** — one tap starts the agent capture flow.
- **Mute/Unmute** — controls only the human LiveKit room mic.

The two controls are independent: changing the human room mic state never starts an agent
capture, and talking to the agent never mutes or unmutes the human room mic.

**Nova must be in the room first.** Activation is hard-gated on Nova being invited:

- If no active/default agent is in the room, no Picovoice worker starts and no microphone
  permission is requested. Tapping **Talk to Agent** surfaces the notice **"Invite an
  agent to the room first."**
- Once Nova is invited and voice is connected, the local wake worker starts only if
  `NEXT_PUBLIC_WAKE_WORD_ENABLED=true` and a valid Picovoice AccessKey/model are present.
  Nova's card still shows **In Room** when idle — she is **not** recording or streaming
  anything until wake activation or Talk to Agent.
- If Nova leaves, the room ends, or voice disconnects, the worker stops and state resets
  automatically.

### State flow

Nova's card maps to one state at a time:

- **In Room** — Nova is present and the wake worker may be armed locally. She is **not**
  recording the prompt.
- **Listening** — the wake phrase fired (or Talk to Agent was tapped); Nova is now
  recording/capturing the user's prompt.
- **Thinking** — recording stopped (2s of silence); Nova is processing.
- **Speaking** — Nova's response audio is playing in the room.

`"Hey Nova"` (local detection) → **Listening** → 2s silence → **Thinking** (sent to
`/api/agents/nova/respond`) → **Speaking** → back to **In Room**. Tapping **Talk to
Agent** enters the same **Listening → Thinking → Speaking → In Room** cycle.

### Silence-based capture (no fixed window)

Capture is **not** a fixed clip. A Web Audio `AnalyserNode` measures the live mic RMS
and the recorder stops once the speaker has been quiet for
`NEXT_PUBLIC_NOVA_SILENCE_TIMEOUT_MS` (default 2000 ms) **after** they have spoken, so a
short pause before the prompt does not cut it off. A hard ceiling of
`NEXT_PUBLIC_NOVA_MAX_RECORDING_MS` (default 15000 ms) guarantees the recorder can never
run forever. `NEXT_PUBLIC_NOVA_SILENCE_THRESHOLD` (default 0.015) is the RMS amplitude
below which a frame counts as silence. (`NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS` is legacy and
no longer drives capture length.)

Code lives in `app/lib/wake-word/`:

- `config.ts` — reads the `NEXT_PUBLIC_*` wake env vars.
- `WakeWordController.ts` — owns a single Porcupine worker + mic subscription
  (init, detection callback, permission errors, cleanup, unsupported fallback).
- `useWakeWord.ts` — React lifecycle wrapper used by `RoomVoice.tsx`.

Silence-detection helpers live in `app/lib/voice-activation.ts`. The room mic
(mute/unmute) stays fully independent of both Nova paths.

The older persistent LiveKit Agent dispatch path is not required for this MVP pipeline.
Nova's generated response is published into the room from the Next.js server route.

### Setup

1. Set `NEXT_PUBLIC_WAKE_WORD_ENABLED=true`.
2. Create a valid AccessKey at [console.picovoice.ai](https://console.picovoice.ai)
   and set `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` (it is browser-side by design — this
   is **not** a backend secret; never `NEXT_PUBLIC_`-prefix LiveKit/Deepgram/Gemini/
   OpenAI/Supabase service-role keys).
3. Download `porcupine_params.pv` from the
   [Porcupine repo](https://github.com/Picovoice/porcupine/blob/master/lib/common/porcupine_params.pv)
   into `public/picovoice/` so it resolves at `/picovoice/porcupine_params.pv`.
   This file is **required** even for the built-in keyword.
4. (Optional, for a true "Nova" wake word) In the Picovoice Console, build a custom
   **Nova** keyword for the **Web (WASM)** platform, download the `.ppn` to
   `public/picovoice/nova.ppn`, and set
   `NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH=/picovoice/nova.ppn`.

If Picovoice throws activation, trial, or limit errors, the room still works and Talk to
Nova continues to capture prompts manually.

If no custom `.ppn` is provided, the app falls back to the built-in keyword
**"Jarvis"** as a temporary stand-in. See `public/picovoice/README.md`.

### Privacy

- Wake detection is on-device; the wake audio stream is consumed by the local WASM
  worker and is never uploaded.
- The backend only receives audio **after** the wake word fires (or Talk to Agent is
  tapped) and the silence-bounded capture completes.
- The worker and its microphone subscription are released when Nova leaves, when voice
  disconnects, and when you leave the room.
- Permission denial and unsupported browsers are handled gracefully (a clear error
  shows and Talk to Agent keeps working).

### Browser limitations

Requires WebAssembly, Web Workers, the Web Audio API, and `getUserMedia` over HTTPS (or
`http://localhost`). Mobile Safari requires a user gesture before mic access — tapping
**Talk to Agent** provides one. If wake detection is unsupported, the UI falls back to the
manual Talk to Agent button only (still silence-based).

### Production (Vercel)

Set `NEXT_PUBLIC_WAKE_WORD_ENABLED=false` unless a valid Picovoice AccessKey is active.
When enabling wake word, add `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`,
`NEXT_PUBLIC_NOVA_WAKE_WORD`, `NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH`, and
`NEXT_PUBLIC_PICOVOICE_MODEL_PATH` in the Vercel Project → Settings → Environment
Variables. The model files under `public/picovoice/` ship as static assets with the
deploy.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current Product Scope

The app supports:

- email/password sign up, login, persisted session, and logout
- email verification and verification email resend
- protected app routes
- start room and join room flow
- shareable room links
- browser-session room state
- Nova invite state and timed push-to-talk response pipeline
- participant and room event display

Human voice rooms and Nova voice intelligence are supported. Nova only receives captured audio clips during the timed activation window.
