# Voxa OpenClaw Adapter (sample / Bring Your Own Agent)

A **mock adapter** showing how an existing agent from another runtime (OpenClaw,
LangChain, CrewAI, AutoGen, …) is imported into Voxa. You don't connect those
runtimes directly — you stand up a small **adapter** that exposes the
Voxa-compatible endpoints and forwards requests to your real runtime.

```
Voxa request  ->  this adapter  ->  OpenClaw / public runtime  ->  Voxa response
```

> **OpenClaw is not trusted by default and is not wired up automatically.** Your
> agent must expose a Voxa-compatible adapter endpoint and still go through Voxa's
> **review + verification + sandbox** before any room use.

## Endpoints

| Method | Path              | Purpose                                              |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/health`         | Liveness probe                                       |
| POST   | `/voxa/handshake` | Identity + capabilities (used by Voxa verification)  |
| POST   | `/voxa/message`   | Forward the user message to the upstream runtime     |
| POST   | `/voxa/voice`     | Optional — text-only voice-beta reply                |

This mock needs **no real OpenClaw credentials** — `callUpstreamRuntime()` returns
a canned reply so you can exercise the whole import → verify → sandbox flow.

## Run it

```bash
cd ../../../packages/sdk && npm install && npm run build   # build the SDK first
cd examples/agents/openclaw-adapter
npm install
npm run build
npm start        # -> http://localhost:8789  (set PORT to change)
```

```bash
curl http://localhost:8789/health
curl -X POST http://localhost:8789/voxa/handshake -d '{"type":"voxa.handshake"}'
curl -X POST http://localhost:8789/voxa/message \
  -H 'content-type: application/json' \
  -d '{"type":"voxa.message","message":"summarize this","context":{"sandbox":true}}'
```

## Import into Voxa

1. Tunnel this adapter (ngrok / cloudflared) to get a public URL.
2. On **`/developers/agents`**, choose **Source / runtime → OpenClaw**, set the
   Endpoint URL to `https://<tunnel>/voxa/handshake`, declare the capabilities your
   adapter reports, and (optionally) add repository / docs URLs.
3. Submit for review. An admin **approves**, then **verifies** the endpoint
   (handshake health check — no bypass for imports).
4. Once approved + verified, test it in the **sandbox** before any room use.

## Security boundary

Voxa only sends the explicit user message string. It **never** runs your agent's
tools, and your agent **never** receives room audio or a room transcript. The
adapter owns the upstream/tool boundary; Voxa stays a messaging surface.
