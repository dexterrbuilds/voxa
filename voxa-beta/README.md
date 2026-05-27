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
DEEPGRAM_API_KEY=your_deepgram_key
GOOGLE_API_KEY=your_google_gemini_key
GEMINI_MODEL=gemini-3.1-flash-lite
NOVA_TTS_PROVIDER=edge
NOVA_TTS_VOICE=en-US-JennyNeural
NOVA_TTS_SPEED=1.15
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
- transcribes the captured audio with Deepgram
- generates a concise Nova response with Gemini Flash-Lite
- synthesizes an MP3 response with Edge TTS
- publishes the synthesized response into the LiveKit room as Nova
- returns playback metadata, transcript, and response text

Provider logic lives under `app/lib/server/nova/` so Deepgram, Gemini, or Edge TTS can be swapped later.

## Nova Activation

Voxa uses push-to-talk / timed activation. Clicking `Talk to Nova` records a bounded audio clip for `NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS`, sends it to the server pipeline, shows Nova as Thinking, and publishes Nova's generated voice back into the LiveKit room so everyone connected to voice can hear it.

The older persistent LiveKit Agent dispatch path is not required for this MVP pipeline. Nova's generated response is published into the room from the Next.js server route.

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
