import type { AgentContext, AgentMessage, AgentResponse } from "./types.js";

// Message handling helpers for external agent endpoints.
//
// Voxa POSTs a `voxa.message` request to an agent's message endpoint and expects
// a `{ text }` JSON body back. These types/helpers let developers implement that
// handler with the same shapes Voxa uses.

// The wire contract Voxa sends to an agent's POST /voxa/message endpoint.
export const VOXA_MESSAGE_TYPE = "voxa.message";

export type VoxaMessageContext = {
  // True when the message originates from the developer sandbox. In experimental
  // room text mode this is false and `mode: "room_text"` is set with `roomId` /
  // `agentId`. Agents receive NO room audio or transcript in either mode.
  sandbox?: boolean;
  // Set to "room_text" for experimental, text-only live-room messages.
  mode?: "room_text" | (string & {});
  roomId?: string;
  agentId?: string;
} & Record<string, unknown>;

export type VoxaMessageRequest = {
  type: typeof VOXA_MESSAGE_TYPE;
  message: string;
  context?: VoxaMessageContext;
};

// Tool execution model (types only — Voxa does not execute tools). An agent may
// report which tools it used while producing a reply, so the sandbox can show a
// "Tools Used" panel. This is descriptive metadata, not an execution protocol.
export type AgentToolStatus = "pending" | "running" | "completed" | "failed";

export type AgentToolInvocation = {
  name: string;
  status: AgentToolStatus;
  detail?: string;
};

export type VoxaMessageResponse = {
  text: string;
  // Optional: hint that Voxa may render the reply progressively (simulated
  // streaming today — no SSE/websocket). Backwards compatible: omit for a plain
  // instant reply.
  streaming?: boolean;
  // Optional: tools the agent used to produce this reply (for display only).
  tools?: AgentToolInvocation[];
} & Record<string, unknown>;

export function createVoxaMessageRequest(
  message: string,
  context?: VoxaMessageContext,
): VoxaMessageRequest {
  return { type: VOXA_MESSAGE_TYPE, message, context };
}

// Richer internal handler shapes (used by the runtime contract / future SDK
// server adapters). The wire request above is the minimal version Voxa sends.
export type AgentMessageRequest = {
  message: AgentMessage;
  context?: AgentContext;
};

export type AgentMessageHandler = (
  message: AgentMessage,
  context?: AgentContext,
) => Promise<AgentResponse> | AgentResponse;

// Build the `{ text }` reply an agent endpoint returns. Pass `streaming` and/or
// `tools` to opt into the sandbox's streaming simulation and Tools Used panel.
// Backwards compatible: `createAgentMessageResponse("hi")` still returns `{ text }`.
export function createAgentMessageResponse(
  text: string,
  extra?: Partial<Omit<VoxaMessageResponse, "text">>,
): VoxaMessageResponse {
  return { text, ...extra };
}
