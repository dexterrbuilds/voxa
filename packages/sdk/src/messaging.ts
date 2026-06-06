import type { AgentContext, AgentMessage, AgentResponse } from "./types.js";

// Message handling helpers for external agent endpoints.
//
// Voxa POSTs a `voxa.message` request to an agent's message endpoint and expects
// a `{ text }` JSON body back. These types/helpers let developers implement that
// handler with the same shapes Voxa uses.

// The wire contract Voxa sends to an agent's POST /voxa/message endpoint.
export const VOXA_MESSAGE_TYPE = "voxa.message";

export type VoxaMessageContext = {
  // True when the message originates from the developer sandbox (never a
  // production room). External agents only ever receive sandbox traffic today.
  sandbox?: boolean;
} & Record<string, unknown>;

export type VoxaMessageRequest = {
  type: typeof VOXA_MESSAGE_TYPE;
  message: string;
  context?: VoxaMessageContext;
};

export type VoxaMessageResponse = {
  text: string;
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

export function createAgentMessageResponse(
  text: string,
  extra?: Partial<Omit<AgentResponse, "text">>,
): AgentResponse {
  return { text, ...extra };
}
