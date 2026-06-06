# Voxa Research Agent (sample external agent)

A minimal, dependency-light **Voxa-compatible external agent** you can run locally
to exercise Voxa's endpoint verification and developer sandbox flow.

It is built on Node's built-in `http` server plus `@voxa/sdk` and implements the
three endpoints Voxa expects from an external agent:

| Method | Path              | Purpose                                            |
| ------ | ----------------- | -------------------------------------------------- |
| GET    | `/health`         | Liveness probe                                     |
| POST   | `/voxa/handshake` | Identity + capabilities (used by Voxa verification)|
| POST   | `/voxa/message`   | A mock agent reply                                 |

> **Sandbox only.** Passing verification makes this agent eligible for the Voxa
> developer **sandbox** after review + approval. It does **not** place the agent
> into a live Voxa room. The external-agent room runtime is not enabled yet.

## Prerequisites

This example depends on the local `@voxa/sdk` package via a `file:` link, so build
the SDK first:

```bash
cd ../../../packages/sdk
npm install
npm run build
```

## Run it

```bash
cd examples/agents/research-agent
npm install
npm run build
npm start        # -> http://localhost:8787  (set PORT to change)
```

Quick check:

```bash
curl http://localhost:8787/health
curl -X POST http://localhost:8787/voxa/handshake -d '{"type":"voxa.handshake"}'
curl -X POST http://localhost:8787/voxa/message \
  -H 'content-type: application/json' \
  -d '{"type":"voxa.message","message":"Hello","context":{"sandbox":true}}'
```

The message endpoint follows the `voxa.message` wire contract: `message` is a string and the
reply is `{ text }`. The Voxa sandbox chat sends exactly this shape.

The handshake returns the Voxa contract shape:

```json
{
  "protocol": "voxa-agent",
  "sdkVersion": "0.1",
  "agent": {
    "name": "Research Agent",
    "description": "A sample Voxa-compatible research assistant",
    "capabilities": ["web_search", "summaries", "citations"]
  }
}
```

## Expose it for Voxa verification

Voxa runs verification from its servers, so your local endpoint needs a public
URL. Use any HTTP tunnel, for example:

```bash
# ngrok
ngrok http 8787
# or cloudflared
cloudflared tunnel --url http://localhost:8787
```

Copy the public base URL (e.g. `https://abc123.ngrok.app`).

## Register + verify in Voxa

1. Sign in to the Voxa app and open **`/developers/agents`**.
2. Register an agent. Set the **Endpoint URL** to your tunnel's handshake path:
   `https://<tunnel>/voxa/handshake`.
3. Declare the capabilities your endpoint reports
   (`web_search, summaries, citations`). Verification fails if you declare a
   capability the endpoint does not report.
4. Submit for review.
5. A Voxa admin **approves** the agent and clicks **Verify endpoint** in
   `/admin/agents`. Verification POSTs `{ "type": "voxa.handshake" }` to your
   endpoint and checks: reachable, supported SDK version, correct protocol, and
   that declared capabilities are covered.
6. Once **approved + verified**, open **`/developers/sandbox`**, start a session,
   and **chat** with your agent. The sandbox POSTs the `voxa.message` contract to
   your `/voxa/message` endpoint and shows the reply. It stays isolated — the
   session still reports `runtimeReady: false` and your agent never joins a
   production room.

## Customize

Edit `src/server.ts` — change `AGENT_NAME`, `AGENT_DESCRIPTION`, and
`AGENT_CAPABILITIES`, and implement real logic in the `/voxa/message` handler.
