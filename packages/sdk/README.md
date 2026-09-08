# Voxa SDK v0.1

The Voxa SDK is the typed foundation for future developer-owned conversational
agents.

This package is intentionally small. It does not publish agents, authenticate
developers, connect to LiveKit, bill usage, create marketplace listings, or manage
onchain identity yet. It defines the shape an agent should expose so the Voxa Agent
Runtime can eventually load first-party, third-party, OpenClaw, avatar, and external
platform agents through the same contract.

Nova is the first demonstration agent running on Voxa. Nova is not the product.

## Minimal Framework-Neutral Adapter

```ts
import { createVoxaAgent } from "@voxa/sdk";

export const handle = createVoxaAgent({
  identity: {
    name: "Research Agent",
    description: "Researches a question using my existing runtime.",
    capabilities: ["web_search"],
  },
  runtime: "custom_endpoint", // or openclaw, langchain, crewai, autogen, other
  tools: true,
  async onMessage(message, context, signal) {
    // Delegate to your runtime; propagate signal to its network requests.
    return { text: `You asked: ${message}` };
  },
});
```

Mount the Fetch API handler in your server. It answers `GET /health` and POST bodies
with `type: "voxa.handshake"` / `"voxa.message"`; optional `onVoice` handles the existing
private `voxa.voice` **transcribed-text** contract, not raw room audio. JSON inputs are
capped at 64 KiB, messages at 4,000 characters, replies at 32,000 characters. Provider
exceptions return a generic error rather than credentials or stack traces.

Runnable Node bridge: [fetch-adapter example](../../examples/agents/fetch-adapter/README.md).
Paste its public `/voxa/handshake` URL into Voxa's **Test connection** flow. Detection is
descriptive only: review, verification, ownership and permissions still apply. A reported
voice capability is not a voice permission. Voxa does not execute reported tools or
automatically integrate any framework. Deploy your own endpoint security/abuse controls.

Validate with `npm run typecheck`, `npm run build`, and
`node --test tests/adapter.test.mjs`. This local package is not published to npm.

## Install

This SDK is local-only for now:

```bash
cd packages/sdk
npm run typecheck
```

## Example

```ts
import { VoxaAgent, type AgentContext, type AgentMessage } from "@voxa/sdk";

class ResearchAgent extends VoxaAgent {
  constructor() {
    super({
      id: "research-agent",
      name: "Research Agent",
      description: "Finds and summarizes useful context inside a Voxa room.",
      capabilities: ["memory", "web_search"],
    });
  }

  async onMessage(message: AgentMessage, _context: AgentContext) {
    return {
      text: `Here is what I found about ${message.text ?? "that topic"}...`,
    };
  }
}
```

## Future registration preview

External agent registration is not live yet, but the SDK now includes typed metadata for
the upcoming registration flow:

```ts
import { defineAgentRegistration } from "@voxa/sdk";

const registration = defineAgentRegistration({
  name: "Research Agent",
  description: "Searches and summarizes live information inside Voxa rooms.",
  endpointUrl: "https://agent.example.com/voxa",
  capabilities: ["web_search", "memory"],
  permissions: ["room:join", "message:read", "voice:speak"],
  tags: ["research", "summaries"],
});
```

The eventual flow is:

1. Build an agent.
2. Register its metadata.
3. Voxa reviews and approves it.
4. The agent appears in an agent selector.
5. Users invite it into rooms.

`registerAgent()` is exported as a disabled preview stub and throws until Voxa enables
developer authentication, API keys, review tooling, and production publishing.

## Endpoint handshake (verification contract)

Before an agent can be sandbox-tested, Voxa verifies its endpoint with a health check. The
endpoint must answer a handshake probe (`POST` with `{ "type": "voxa.handshake" }`) with an
`AgentHandshake` JSON body. The SDK provides the contract:

```ts
import { createAgentHandshake, VOXA_AGENT_PROTOCOL } from "@voxa/sdk";

// In your endpoint handler, when you receive { type: "voxa.handshake" }:
const handshake = createAgentHandshake({
  id: "research-agent",
  name: "Research Agent",
  capabilities: ["web_search", "memory"],
  permissions: ["room:join", "message:read", "voice:speak"],
});
// → { protocol: "voxa-agent", sdkVersion: "0.1", agent: { id, name, capabilities, permissions } }
```

Voxa's endpoint health check verifies three things: the endpoint is reachable, the handshake
`protocol`/`sdkVersion` are compatible (`VOXA_AGENT_PROTOCOL`, `SUPPORTED_SDK_VERSIONS`), and
the reported capabilities cover what was declared at registration. Passing verification makes an
approved agent eligible for the **developer sandbox only** — it does not place the agent into a
production room. The external-agent runtime is not live yet.

### Message contract

Voxa's sandbox sends a `voxa.message` request to your agent's `POST /voxa/message` endpoint and
expects a `{ text }` reply:

```ts
import { createVoxaMessageRequest, createAgentMessageResponse, type VoxaMessageRequest } from "@voxa/sdk";

// What Voxa sends:
createVoxaMessageRequest("Hello", { sandbox: true });
// -> { type: "voxa.message", message: "Hello", context: { sandbox: true } }

// In your endpoint handler:
app.post("/voxa/message", (req, res) => {
  const { message } = req.body as VoxaMessageRequest; // message is a string
  res.json(createAgentMessageResponse(`You said: ${message}`));
});
```

`createAgentMessageResponse(text, extra?)` builds the `{ text }` reply. `VoxaMessageRequest` /
`VoxaMessageResponse` type the wire shapes; `AgentMessageHandler` / `AgentMessageRequest` are the
richer internal handler shapes.

#### Streaming + tools (optional, backwards compatible)

The reply may also include a `streaming` hint and a `tools` array. Both are optional — a plain
`{ text }` reply still works.

```ts
res.json(
  createAgentMessageResponse("Here's what I found...", {
    streaming: true,
    tools: [
      { name: "web_search", status: "completed" },
      { name: "summarizer", status: "completed" },
    ],
  }),
);
```

- `streaming: true` tells the sandbox to reveal the reply progressively (a **client-side
  simulation** today — no SSE or websocket).
- `tools: AgentToolInvocation[]` (`{ name, status, detail? }`, status one of `pending` /
  `running` / `completed` / `failed`) is **display-only metadata** rendered as a "Tools Used"
  panel. Voxa never executes tools.

The developer **sandbox chat** (`/developers/sandbox`) uses this contract to send messages
straight to your verified endpoint and display the reply — in isolation. It still does **not**
connect your agent into a production room.

#### Multi-agent sandbox

Your agent always implements the **same single-agent** endpoint contract above. Voxa's sandbox can
drive **several** of your approved + verified agents in one session: it sends to one agent
(targeted) or fans the same message out to all of them (broadcast) and shows each agent's reply
independently. Nothing changes on your side — each endpoint just answers its own `voxa.message`
request. This is still sandbox-only; it is not a production multi-agent room.

#### Per-agent thread history (room-text mode)

In experimental text-only room mode, Voxa keeps a **room-local thread per agent** and includes the
recent turns as `context.history`:

```ts
// context = { sandbox: false, roomId, agentId, mode: "room_text", history: VoxaMessageHistoryTurn[] }
app.post("/voxa/message", (req, res) => {
  const { message, context } = req.body as VoxaMessageRequest;
  const lastUserTurn = context?.history?.filter((t) => t.role === "user").at(-1)?.text;
  const note = lastUserTurn ? ` (following up on "${lastUserTurn}")` : "";
  res.json(createAgentMessageResponse(`Re: ${message}${note}`));
});
```

`history` (`VoxaMessageHistoryTurn[]`, `{ role:"user"|"agent", text }`) is **only** the recent turns
between this user and **this** agent — never a full room transcript, other agents' messages, Nova
memory, or audio. Using it is optional and backwards compatible.

### Runnable examples

Two complete, runnable sample agents live under
[`examples/agents/`](../../examples/agents): [`research-agent`](../../examples/agents/research-agent)
and [`code-assistant`](../../examples/agents/code-assistant). Each is a minimal Node HTTP server
implementing `/health`, `/voxa/handshake`, and `/voxa/message` with this SDK (with different
capabilities + tools), plus a README covering tunneling, registration, verification, and the
sandbox flow. Run them on different ports to test the multi-agent sandbox.

## Current Scope

- `VoxaAgent` base class
- shared agent status/capability/message/response types
- join, leave, message, say, and status primitives
- typed future agent registration metadata
- endpoint handshake contract for verification (`createAgentHandshake`)
- message handler helpers (`createAgentMessageResponse`, `createVoxaMessageRequest`, `AgentMessageHandler`)
- optional streaming hint + tool metadata (`AgentToolInvocation`) on the message reply

## Not Implemented Yet

- live network registration
- external agent auth
- LiveKit dispatch
- Supabase persistence
- marketplace publishing
- billing
- onchain identities
- avatar/runtime packaging

The next step is wiring these types into `voxa-beta/app/lib/runtime/` so external
agents and Nova can share one runtime contract without breaking the current Nova MVP
pipeline.
