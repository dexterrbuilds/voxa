import type {
  AgentRuntimeBroadcastInput,
  AgentRuntimeBroadcastResult,
  AgentRuntimeMessageInput,
  AgentRuntimeReply,
  AgentRuntimeTransport,
} from "@/lib/server/agents/runtime/types";
import {
  deriveMessageEndpoint,
  postVoxaMessage,
  VOXA_MESSAGE_TYPE,
} from "@/lib/server/agents/runtime/voxaMessageClient";

// SandboxRuntime: the developer-sandbox agent transport.
//
// It sends a `voxa.message` request to a verified agent's message endpoint and
// returns the `{ text }` reply. It NEVER touches production rooms, LiveKit, or
// Supabase room state — it is a direct, isolated HTTP call from Voxa's server to
// the developer's own endpoint. Every message is forced to `sandbox: true`.
//
// Shares its wire transport with RoomTextRuntime via `voxaMessageClient`. A future
// `ProductionRuntime` will implement the same `AgentRuntimeTransport` interface and
// add room/dispatch wiring. It does not exist yet.

// Re-exported for backwards compatibility with existing importers.
export { deriveMessageEndpoint, VOXA_MESSAGE_TYPE };

export class SandboxRuntime implements AgentRuntimeTransport {
  readonly mode = "sandbox" as const;

  async sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    return postVoxaMessage({
      signal: input.signal,
      requestId: input.requestId,
      endpointUrl: input.endpointUrl,
      message: input.message,
      // Force sandbox marking regardless of caller input.
      context: { ...input.context, sandbox: true },
    });
  }

  // Named entry point for the multi-agent routing layer. Same behavior as
  // sendMessage; kept distinct so a future ProductionRuntime can specialize it.
  async sendMessageToAgent(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    return this.sendMessage(input);
  }

  // Fan out one message to many agents in parallel. Each agent's result is
  // independent — one unreachable endpoint never fails the others.
  async broadcastMessage(
    input: AgentRuntimeBroadcastInput,
  ): Promise<AgentRuntimeBroadcastResult[]> {
    return Promise.all(
      input.targets.map(async (target) => ({
        agentId: target.agentId,
        agentName: target.agentName,
        reply: await this.sendMessage({
          signal: input.signal,
          requestId: input.requestId,
          endpointUrl: target.endpointUrl,
          message: input.message,
          context: input.context,
        }),
      })),
    );
  }
}

export const sandboxRuntime = new SandboxRuntime();
