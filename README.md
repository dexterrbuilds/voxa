# Voxa

Voxa is the runtime layer for conversational AI agents.

The current product is a focused MVP: authenticated users create private LiveKit voice
rooms, invite Nova, and talk to her through a controlled wake/tap voice flow. Nova is
the first first-party demonstration agent. Nova is not the product itself.

## Repo Map

```text
.
├── src/                  # Vite marketing site and mock-only product prototype
├── voxa-beta/            # Real Next.js product app
├── voxa-agent/           # Disabled Python LiveKit Agent path for Nova
├── packages/sdk/         # Local SDK v0.1 typed agent contract
└── api/subdomain.js      # Vercel subdomain stub
```

## Projects

### Marketing Site

The root app is a Vite + React site for the public Voxa landing pages.

```bash
bun run dev
bun run build
```

The old `src/routes/voxa/*` and `src/components/voxa/*` files are mock UI only. They do
not represent the real product and should not be extended for product functionality.

Developer docs live in the marketing app at `/developers/docs` with nested static docs
routes for runtime, SDK, roadmap, and FAQ content. The docs are a professional preview of
the Agent Runtime and SDK direction; they do not implement external agents, API keys,
billing, marketplace publishing, or onboarding flows.

Developer SDK beta interest lives at `/developers/access`. The form is a client-side
experience backed by the Vercel serverless endpoint `api/developer-access.js`. In
production it writes submissions to Supabase table `public.developer_access_requests`.
Run `supabase/developer-access-requests.sql`, then set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` on the marketing Vercel project. Local development falls back
to browser `localStorage` under `voxa-sdk-beta-requests` when the API endpoint is not
available.

### Voxa Beta Product

`voxa-beta/` is the real app. It contains:

- Supabase auth
- private room creation/joining
- Supabase room participant sync
- LiveKit human voice rooms
- Nova invite state
- Nova Path A voice pipeline: browser capture -> Deepgram -> Gemini -> TTS -> LiveKit playback
- short-term room memory for Nova
- multilingual STT defaults
- optional Picovoice wake word, disabled by default with `NEXT_PUBLIC_WAKE_WORD_ENABLED=false`

```bash
cd voxa-beta
npm install
npm run dev
```

### Voxa Agent

`voxa-agent/` is a separate Python LiveKit Agent project for the disabled Path B
implementation. It is the better long-term primitive for deployable agents, but it is
not the active MVP Nova path.

```bash
cd voxa-agent
python -m venv .venv
source .venv/bin/activate
pip install -e .
python src/agent.py dev
```

### SDK v0.1

`packages/sdk/` is a local typed SDK foundation for future developer agents. It exposes
the `VoxaAgent` base class and shared agent types. It does not implement networking,
auth, billing, marketplace publishing, onchain identity, or LiveKit dispatch yet.

```bash
cd packages/sdk
npm run typecheck
```

## Agent Runtime Foundation

The product runtime foundation lives in `voxa-beta/app/lib/runtime/`.

It defines:

- agent identity
- statuses
- capabilities
- messages
- responses
- registry
- runtime dispatch surface

Nova is represented as the first first-party runtime agent in
`voxa-beta/app/lib/agents/nova/`. This currently centralizes Nova metadata and prepares
the product for future multi-agent support. It does not replace the working Nova voice
pipeline yet.

The first-party agent manifest lives in `voxa-beta/app/lib/agents/manifest.ts`.
It exposes:

- `getAvailableAgents()`
- `getAgentById(agentId)`
- `isFirstPartyAgent(agentId)`
- `getDefaultAgent()`
- `getAgentParticipantUserId(agentId)`

For now, the manifest contains only Nova. The product reads safe display/invite metadata
from this manifest, while keeping legacy database compatibility: agent participants are
still stored in `room_participants.user_id` using the agent id, so Nova remains
`user_id = "nova"` until a future schema introduces a dedicated agent identity column.

Manifest entries also support platform-facing metadata:

- `availability: "available" | "coming_soon"`
- `category`
- `shortLabel`
- `tags`

Nova is the only `available` agent today. Research Agent, Meeting Summarizer, and Code
Assistant are first-party `coming_soon` placeholders shown in the selector to communicate
the platform direction. They are UI-only and have no backend, dispatch, billing, database,
or marketplace behavior.

The next runtime step is moving from this static first-party manifest to a DB-backed
agent registry that supports developer agents, OpenClaw agents, avatars, external
platform agents, permissions, ownership, and publishing.

## Agent Registration Scaffold

`voxa-beta/` now includes a future external-agent registration scaffold:

- `POST /api/agents/register`
- `GET /api/agents`
- `GET /api/agents/:id`
- `PATCH /api/agents/:id`

These routes are authenticated with the user's Supabase bearer token and are scoped to
the submitting user. They accept developer metadata for draft or pending-review agents
only. Developers cannot self-approve agents, publish public listings, or make submitted
agents appear in rooms.

The additive SQL lives in:

```text
voxa-beta/supabase-agent-registration-schema.sql
```

It creates `public.agents` as a review queue with fields for identity, creator,
endpoint, status, visibility, capabilities, permissions, tags, and metadata. It does not
change `room_participants`, does not add `agent_id`, and does not change the current
Nova compatibility behavior where Nova uses `room_participants.user_id = "nova"`.

External agents remain disabled until Voxa adds approval tooling, endpoint verification,
permissions enforcement, rate limits, abuse protection, and a DB-backed runtime registry.

## Generic Agent Invite Flow

Room logic now has a generic first-party invite path:

- local/session fallback: `useRoomStore().inviteAgent(roomId, agentId)`
- shared Supabase state: `inviteAgentToSharedRoom(roomId, agentId)`
- room hook: `useRoom().inviteAgentShared(roomId, agentId)`

`inviteNova` and `inviteNovaShared` still exist as compatibility wrappers around
`agentId = "nova"` so existing UI and the active Nova Path A pipeline keep working.

The generic path validates `agentId` against the first-party manifest, reads display
metadata from that manifest, and writes the current compatibility participant id through
`getAgentParticipantUserId(agentId)`.

## Agent Selector UI

The room sidebar uses `voxa-beta/app/components/AgentSelector.tsx` as a small
manifest-driven first-party agent selector. It reads `getAvailableAgents()`, renders
agent name, description, capabilities, invited/in-room state, and calls
`inviteAgent(agentId)` / `inviteAgentShared(roomId, agentId)` through the room page.

Only Nova is inviteable today. Coming-soon first-party agents render as disabled entries
with a "Coming soon" button. The component is structured so additional first-party agents
can appear from the manifest later without redesigning the room UI.

## Current Nova Paths

- Path A: active MVP path in `voxa-beta`, turn-based, wake/tap activated.
- Path B: disabled Python LiveKit Agent in `voxa-agent`, feature-gated for future use.

Do not switch paths casually. The active product depends on Path A.

## Current Limits

- Agent Runtime is foundational only.
- SDK is local-only and not published.
- External agents are not supported yet; registration is a metadata review scaffold only.
- Room/database security depends on Supabase RLS setup.
- Nova is still the only active agent in product UI.
- Long-term/cross-room agent memory is not implemented.
- Wake word is optional and should stay disabled unless a valid Picovoice AccessKey is
  active; Talk to Agent is the reliable manual fallback.
- Room voice controls are fixed in a mobile-safe bottom panel. Human Mute/Unmute controls
  the LiveKit room mic only; Talk to Agent starts the separate silence-based agent
  capture and auto-sends after the user stops speaking.

For day-to-day coding guidance, read `AGENTS.md` and `CLAUDE.md`.
