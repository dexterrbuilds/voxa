# Voxa Code Assistant (sample external agent)

A second minimal **Voxa-compatible external agent** (alongside
[`research-agent`](../research-agent)) so you can test the developer sandbox with
**multiple agents** that report different capabilities.

It implements the same three endpoints, built on `@voxa/sdk`:

| Method | Path              | Purpose                                             |
| ------ | ----------------- | --------------------------------------------------- |
| GET    | `/health`         | Liveness probe                                      |
| POST   | `/voxa/handshake` | Identity + capabilities (`code_review`, `debugging`, `architecture`) |
| POST   | `/voxa/message`   | A mock reply with `streaming: true` + `tools`       |

> **Sandbox only.** Verification makes this agent eligible for the developer
> **sandbox** after review + approval. It does **not** place the agent into a live
> Voxa room.

## Prerequisites

Build the local SDK first:

```bash
cd ../../../packages/sdk && npm install && npm run build
```

## Run it

```bash
cd examples/agents/code-assistant
npm install
npm run build
npm start        # -> http://localhost:8788  (set PORT to change)
```

Run it on a different port than `research-agent` (8787) so you can tunnel and
register both, then select them together in the sandbox.

```bash
curl http://localhost:8788/health
curl -X POST http://localhost:8788/voxa/handshake -d '{"type":"voxa.handshake"}'
curl -X POST http://localhost:8788/voxa/message \
  -H 'content-type: application/json' \
  -d '{"type":"voxa.message","message":"review this","context":{"sandbox":true}}'
```

## Register, verify, sandbox

Same flow as the research agent: tunnel the endpoint, register
`https://<tunnel>/voxa/handshake` at `/developers/agents`, get it approved +
verified, then select it (with other agents) on `/developers/sandbox`. Use
**Send to all** to broadcast one message to every selected agent.

In experimental text-only room mode it also reads `context.history` (its own
scoped per-room thread) and references the previous user turn on follow-ups.
