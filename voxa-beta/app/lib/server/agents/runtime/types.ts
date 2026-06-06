// Agent runtime transport contract.
//
// This is the reusable seam that the sandbox uses today and a future
// `ProductionRuntime` will implement tomorrow. The shape is intentionally the
// same for both: "given an agent endpoint + a message, return a reply". Only the
// SandboxRuntime is wired up now, and it ALWAYS marks traffic as `sandbox: true`.
// A ProductionRuntime would implement the same interface but add room/LiveKit
// dispatch — it does not exist yet, and external agents stay out of rooms.

export type AgentRuntimeMode = "sandbox" | "production";

export type AgentRuntimeMessageContext = {
  sandbox?: boolean;
} & Record<string, unknown>;

export type AgentRuntimeMessageInput = {
  // The agent's REGISTERED endpoint (the verified handshake URL). The transport
  // derives the message endpoint from it.
  endpointUrl: string;
  message: string;
  context?: AgentRuntimeMessageContext;
};

export type AgentRuntimeReply =
  | { ok: true; text: string; raw: unknown }
  | { ok: false; code: "agent_unreachable" | "agent_bad_response"; detail: string };

export interface AgentRuntimeTransport {
  readonly mode: AgentRuntimeMode;
  sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply>;
}
