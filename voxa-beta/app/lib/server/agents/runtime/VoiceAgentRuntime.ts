import type {
  AgentRuntimeBroadcastInput,
  AgentRuntimeBroadcastResult,
  AgentRuntimeMessageInput,
  AgentRuntimeReply,
  AgentRuntimeTransport,
} from "@/lib/server/agents/runtime/types";
import { postVoxaMessage, VOXA_VOICE_TYPE } from "@/lib/server/agents/runtime/voxaMessageClient";

// VoiceAgentRuntime: the PRIVATE push-to-talk voice-beta transport for approved +
// verified external agents that have been admin-granted `room_voice_beta`.
//
// It is deliberately SEPARATE from SandboxRuntime and RoomTextRuntime, but reuses
// the same wire client (`voxaMessageClient`). The differences are the forced
// context and the wire `type`:
//   - type: "voxa.voice"
//   - sandbox: false
//   - mode: "voice_beta"
//   - roomId / agentId / history (passed by the caller)
//
// SAFETY: this NEVER touches LiveKit, never streams room audio, never sends a
// room transcript. The voice bridge runs STT -> this transport -> TTS, and the
// TTS audio is played back ONLY to the initiating user's browser. The agent
// receives only the single transcribed message string + its own scoped thread
// history. The reply's `text` is required; an optional `voice.preferredVoice` is
// IGNORED for now (always uses the configured default TTS voice).
// TODO: future approved per-agent voice profiles may honor `voice.preferredVoice`.

export class VoiceAgentRuntime implements AgentRuntimeTransport {
  readonly mode = "voice_beta" as const;

  async sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply> {
    return postVoxaMessage({
      signal: input.signal,
      requestId: input.requestId,
      endpointUrl: input.endpointUrl,
      message: input.message,
      type: VOXA_VOICE_TYPE,
      context: { ...input.context, sandbox: false, mode: "voice_beta" },
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

export const voiceAgentRuntime = new VoiceAgentRuntime();
