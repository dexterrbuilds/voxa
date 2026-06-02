# Voxa App Setup

## Supabase Email Authentication

Voxa uses Supabase Auth. Email/password is the active sign-in path for local product testing.

Create `voxa-beta/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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

The human room mic is independent of Nova. You join muted once by default; after that the
mic **stays in whatever state you choose** — talking to Nova never auto-mutes it. Nova
capture uses its own microphone stream and never toggles the LiveKit room mic.

## Nova Activation (call-to-wake by default)

**Call-to-wake ("Hey Nova") is the default, hands-free Nova interaction and starts
automatically once Nova is in the room — there is no toggle to enable.** Wake detection
uses [Picovoice Porcupine Web](https://picovoice.ai/docs/porcupine/) and runs **entirely
in the browser**; the wake-listening audio never reaches the backend. **Talk to Nova**
remains as a small secondary manual fallback that uses the same capture logic.

**Nova must be in the room first.** Activation is hard-gated on Nova being invited:

- If Nova is not in the room, no Picovoice worker starts and no microphone permission
  is requested. Tapping **Talk to Nova** surfaces the notice **"Invite Nova to the room
  first."**
- Once Nova is invited and voice is connected, the local wake worker starts
  automatically and Nova's card shows **In Room** (the wake worker is armed locally and
  waiting for the phrase — she is **not** recording or streaming anything yet).
- If Nova leaves, the room ends, or voice disconnects, the worker stops and state resets
  automatically.

### State flow

Nova's card maps to one state at a time:

- **In Room** — Nova is present and the wake worker may be armed locally. She is **not**
  recording the prompt.
- **Listening** — the wake phrase fired (or Talk to Nova was tapped); Nova is now
  recording/capturing the user's prompt.
- **Thinking** — recording stopped (2s of silence); Nova is processing.
- **Speaking** — Nova's response audio is playing in the room.

`"Hey Nova"` (local detection) → **Listening** → 2s silence → **Thinking** (sent to
`/api/agents/nova/respond`) → **Speaking** → back to **In Room**. Tapping **Talk to
Nova** enters the same **Listening → Thinking → Speaking → In Room** cycle.

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

1. Create a free AccessKey at [console.picovoice.ai](https://console.picovoice.ai)
   and set `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` (it is browser-side by design — this
   is **not** a backend secret; never `NEXT_PUBLIC_`-prefix LiveKit/Deepgram/Gemini/
   OpenAI/Supabase service-role keys).
2. Download `porcupine_params.pv` from the
   [Porcupine repo](https://github.com/Picovoice/porcupine/blob/master/lib/common/porcupine_params.pv)
   into `public/picovoice/` so it resolves at `/picovoice/porcupine_params.pv`.
   This file is **required** even for the built-in keyword.
3. (Optional, for a true "Nova" wake word) In the Picovoice Console, build a custom
   **Nova** keyword for the **Web (WASM)** platform, download the `.ppn` to
   `public/picovoice/nova.ppn`, and set
   `NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH=/picovoice/nova.ppn`.

If no custom `.ppn` is provided, the app falls back to the built-in keyword
**"Jarvis"** as a temporary stand-in. See `public/picovoice/README.md`.

### Privacy

- Wake detection is on-device; the wake audio stream is consumed by the local WASM
  worker and is never uploaded.
- The backend only receives audio **after** the wake word fires (or Talk to Nova is
  tapped) and the silence-bounded capture completes.
- The worker and its microphone subscription are released when Nova leaves, when voice
  disconnects, and when you leave the room.
- Permission denial and unsupported browsers are handled gracefully (a clear error
  shows and Talk to Nova keeps working).

### Browser limitations

Requires WebAssembly, Web Workers, the Web Audio API, and `getUserMedia` over HTTPS (or
`http://localhost`). Mobile Safari requires a user gesture before mic access — tapping
**Talk to Nova** provides one. If wake detection is unsupported, the UI falls back to the
manual Talk to Nova button only (still silence-based).

### Production (Vercel)

Add `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY`, `NEXT_PUBLIC_NOVA_WAKE_WORD`,
`NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH`, and `NEXT_PUBLIC_PICOVOICE_MODEL_PATH` in the
Vercel Project → Settings → Environment Variables. The model files under
`public/picovoice/` ship as static assets with the deploy.

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
