import type {
  AgentRuntimeBroadcastInput,
  AgentRuntimeBroadcastResult,
  AgentRuntimeMessageInput,
  AgentRuntimeReply,
  AgentRuntimeTransport,
} from "@/lib/server/agents/runtime/types";
import { postVoxaMessage } from "@/lib/server/agents/runtime/voxaMessageClient";

// RoomTextRuntime: EXPERIMENTAL text-only transport for approved + verified
// external agents that have been invited into a live room.
//
// It is deliberately separate from SandboxRuntime and reuses the same wire
// transport (`voxaMessageClient`). The only differences are the forced context:
//   - sandbox: false
//   - mode: "room_text"
//   - roomId / agentId (passed by the caller)
//
// SAFETY: it sends ONLY the single user message string. It never sends room
// audio, never sends a transcript, never dispatches to LiveKit, and never
// publishes voice. The reply is text only. A future `ProductionRuntime` can reuse
// this same interface and transport.

export class RoomTextRuntime implements AgentRuntimeTransport {
  readonly mode = "room_text" as const;

  async sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    return postVoxaMessage({
      signal: input.signal,
      requestId: input.requestId,
      endpointUrl: input.endpointUrl,
      message: input.message,
      // Force room-text marking; sandbox is explicitly false. No transcript is
      // ever added here — only the caller's `roomId` / `agentId` metadata.
      context: { ...input.context, sandbox: false, mode: "room_text" },
    });
  }

  async sendMessageToAgent(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    return this.sendMessage(input);
  }

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

export const roomTextRuntime = new RoomTextRuntime();
