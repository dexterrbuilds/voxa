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

Nova dispatch modes:

- `Manual` is the MVP default. Nova should only respond when directly addressed by name, for example “Nova...”.
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
- Nova invite state and LiveKit agent dispatch
- participant and room event display

Human voice rooms are supported. Nova voice intelligence is intentionally outside the current scope.
