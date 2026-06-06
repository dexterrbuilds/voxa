import type { AgentContext, AgentMessage, AgentResponse } from "./types.js";

// Message handling helpers for external agent endpoints.
//
// Voxa's future sandbox/runtime will POST `{ message, context }` to an agent's
// message endpoint and expect an `AgentResponse` JSON body. These types/helpers
// let developers implement that handler with the same shapes Voxa uses.

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
