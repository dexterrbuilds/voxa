# Voxa App Setup

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
