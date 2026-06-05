# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in the Voxa repository.

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

## What exists today vs. the vision

The working product today is narrow: an invite-only, browser-based LiveKit voice room
where authenticated humans talk to one agent, Nova. None of the platform vision
(multi-agent, SDK, marketplace, memory, agent identity/permissions, cross-platform
deployment to Meet/Zoom/X Spaces/Discord/Telegram/phone) is built yet. Build toward it;
don't assume it's there.

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

## Dev commands

- Marketing/SPA (repo root): `bun run dev` (Vite, http://localhost:5173),
  `bun run build`, `bun run lint`, `bun run format`
- Product: `cd voxa-beta && npm install && npm run dev` (Next, http://localhost:3000)
- Agent: `cd voxa-agent && pip install -e . && python src/agent.py dev`
- SDK: `cd packages/sdk && npm run typecheck`
- No test suite exists in any project.

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

## Key env (voxa-beta/.env.local — see voxa-beta/.env.example)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `LIVEKIT_URL`,
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
