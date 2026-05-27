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
LIVEKIT_NOVA_AGENT_NAME=nova
NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS=10000
NEXT_PUBLIC_WAKE_WORD=Nova
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=your_picovoice_access_key
NEXT_PUBLIC_PICOVOICE_KEYWORD_PATH=/wake/nova_web.ppn
NEXT_PUBLIC_PICOVOICE_MODEL_PATH=/wake/porcupine_params.pv
NEXT_PUBLIC_PICOVOICE_SENSITIVITY=0.65
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

## Nova LiveKit Agent Dispatch

Nova is deployed as a separate LiveKit Agent from `../voxa-agent`. The beta app dispatches Nova through:

```http
POST /api/agents/nova/dispatch
```

The endpoint:

- requires a signed-in Supabase user
- verifies the user is a human participant in the room
- uses `LIVEKIT_API_SECRET` only on the server
- dispatches the LiveKit agent with dispatch name `nova`

When the user clicks Invite on Nova, Voxa first adds Nova to Supabase `room_participants`, then asks LiveKit to dispatch the deployed agent into the same room.

## Nova Activation

While Picovoice access is pending, Voxa uses a push-to-talk / timed activation fallback. The LiveKit microphone track is created when the user joins voice, then muted immediately. Clicking `Talk to Nova` unmutes the mic for `NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS` and then auto-mutes it again. The user can click `Stop` earlier.

Future wake-word detection will use Picovoice Porcupine locally in the browser with the same mic gating behavior.

Required public assets:

- `voxa-beta/public/wake/nova_web.ppn`: custom Picovoice wake-word model for “Nova”, exported for Web/WASM.
- `voxa-beta/public/wake/porcupine_params.pv`: Porcupine parameter model.

Picovoice is not required for the current push-to-talk fallback.

Nova dispatch modes:

- `Manual` is the MVP default. Push-to-talk activates audio before it reaches Nova.
- `Silent` dispatches Nova as a present/listening agent but tells the worker not to synthesize responses.
- `Co-host` is intentionally disabled for now.

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
- Nova invite state, timed push-to-talk activation, and LiveKit agent dispatch
- participant and room event display

Human voice rooms and Nova voice intelligence are supported. Nova only receives microphone audio during the timed activation window.
