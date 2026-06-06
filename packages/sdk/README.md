# Voxa SDK v0.1

The Voxa SDK is the typed foundation for future developer-owned conversational
agents.

This package is intentionally small. It does not publish agents, authenticate
developers, connect to LiveKit, bill usage, create marketplace listings, or manage
onchain identity yet. It defines the shape an agent should expose so the Voxa Agent
Runtime can eventually load first-party, third-party, OpenClaw, avatar, and external
platform agents through the same contract.

Nova is the first demonstration agent running on Voxa. Nova is not the product.

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

For the message endpoint, `createAgentMessageResponse(text, extra?)` builds an `AgentResponse`,
and `AgentMessageHandler` / `AgentMessageRequest` type the handler and the incoming
`{ message, context }` body.

### Runnable example

A complete, runnable sample agent lives at
[`examples/agents/research-agent`](../../examples/agents/research-agent). It is a minimal Node
HTTP server implementing `/health`, `/voxa/handshake`, and `/voxa/message` with this SDK, plus a
README covering tunneling, registration, verification, and the sandbox flow.

## Current Scope

- `VoxaAgent` base class
- shared agent status/capability/message/response types
- join, leave, message, say, and status primitives
- typed future agent registration metadata
- endpoint handshake contract for verification (`createAgentHandshake`)
- message handler helpers (`createAgentMessageResponse`, `AgentMessageHandler`)

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
