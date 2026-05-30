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

## This repo is 4 projects

1. **`src/`** — Vite + React 19 SPA. The **marketing site** (`/`, `/product`,
   `/developers`, `/use-cases`, `/waitlist`) PLUS a **mock-only** product prototype under
   `/voxa/*` (no backend; static data in `src/lib/rooms.ts`, simulated auth). Do not
   confuse the `/voxa/*` mock with the real product.
2. **`voxa-beta/`** — **Next.js 16 (App Router). THE REAL PRODUCT.** Auth, rooms, Nova voice.
3. **`voxa-agent/`** — Python LiveKit Agent (Gemini Live realtime). Built but
   feature-flagged OFF. Deployed separately to LiveKit Cloud.
4. **`api/subdomain.js`** — Vercel stub, currently non-functional.

## Dev commands

- Marketing/SPA (repo root): `bun run dev` (Vite, http://localhost:5173),
  `bun run build`, `bun run lint`, `bun run format`
- Product: `cd voxa-beta && npm install && npm run dev` (Next, http://localhost:3000)
- Agent: `cd voxa-agent && pip install -e . && python src/agent.py dev`
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

- **Path A — ACTIVE (current MVP), push-to-talk, turn-based, stateless:**
  `app/components/RoomVoice.tsx` records a bounded ~10s clip →
  `POST /api/agents/nova/respond` → Deepgram STT → Gemini
  (`app/lib/server/nova/providers/llm/gemini.ts`, with Google Search grounding +
  injected current date) → Edge/OpenAI TTS → `app/lib/server/nova/livekit-publisher.ts`
  decodes the MP3 and publishes audio as an **ephemeral** LiveKit participant
  (`agent:nova:playback:<uuid>`). Each turn opens and tears down a fresh LiveKit
  connection. Nova has **no memory** — only the latest transcript is sent to Gemini.
  Note: `app/lib/server/nova/pipeline.ts` (`runNovaPipeline`) is **dead code**.
- **Path B — DISABLED (vision-aligned):** `voxa-agent/src/agent.py` is a Gemini Live
  native-audio realtime agent dispatched via `/api/agents/nova/dispatch`, gated behind
  `NEXT_PUBLIC_NOVA_LIVEKIT_AGENT_ENABLED === "true"` (see `app/lib/room.ts`). Lower
  latency and the right primitive for the multi-agent / cross-platform future, but off
  by default.

If you touch Nova, state which path. Generalizing the agent layer should favor Path B's
dispatch+worker model over Path A.

## Provider abstraction

`voxa-beta/app/lib/server/nova/providers/` isolates STT (Deepgram, `nova-3`), LLM
(Gemini), and TTS (Edge default, OpenAI fallback). Swap/extend providers here. All
provider errors flow through `app/lib/server/nova/errors.ts` (`NovaProviderError`, with
token/key redaction in messages).

## Key env (voxa-beta/.env.local — see voxa-beta/.env.example)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (server-only — never prefix LiveKit/Deepgram/
Gemini/OpenAI keys with `NEXT_PUBLIC`); `DEEPGRAM_API_KEY`; `GOOGLE_API_KEY` +
`GEMINI_MODEL`; `NOVA_TTS_PROVIDER`/`NOVA_TTS_VOICE`/`NOVA_TTS_SPEED`; optional
`OPENAI_API_KEY`/`OPENAI_TTS_MODEL`; `NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS` (record window).
Agent env lives in `voxa-agent/.env.local` (see its `.env.example`).

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
- **Wake-word is gone** (push-to-talk now) despite stale "local wake word" comments in
  `voxa-agent/src/agent.py` and the READMEs.
- **Everything hardcodes the single agent "nova"** (DB rows with `user_id = "nova"`,
  identities, dispatch name, UI). There is no `Agent` abstraction yet.
- **`@livekit/rtc-node` uses native FFI** — confirm the deploy target (likely NOT Vercel
  serverless; needs a long-running Node host/container).
- **Verify model IDs resolve** (`GEMINI_MODEL`, the agent's Gemini Live model) before
  relying on them in production.
- `src/voxa/*` is mock UI; the real product is `voxa-beta`. Three root docs
  (`IMPLEMENTATION_SUMMARY.md`, `MOBILE_IMPROVEMENTS.md`,
  `NON_ESSENTIAL_FEATURES_REMOVAL.md`) describe an older "cinematic voice rooms" spec and
  are partly stale.

## Doing tasks

- Don't introduce backwards-compat shims or speculative abstractions; don't create docs
  unless asked.
- Confirm before risky/irreversible actions (DB migrations, pushes, deploys, deleting the
  mock SPA).
- When in doubt, choose the implementation that generalizes Voxa from "Nova demo" toward
  "agent runtime."
