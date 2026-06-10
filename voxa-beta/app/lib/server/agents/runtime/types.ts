// Agent runtime transport contract.
//
// This is the reusable seam that the sandbox uses today and a future
// `ProductionRuntime` will implement tomorrow. The shape is intentionally the
// same for both: "given an agent endpoint + a message, return a reply". Only the
// SandboxRuntime is wired up now, and it ALWAYS marks traffic as `sandbox: true`.
// A ProductionRuntime would implement the same interface but add room/LiveKit
// dispatch — it does not exist yet, and external agents stay out of rooms.

export type AgentRuntimeMode = "sandbox" | "room_text" | "production";

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

// Tool execution model (descriptive metadata only — Voxa never executes tools).
export type AgentRuntimeToolStatus = "pending" | "running" | "completed" | "failed";

export type AgentRuntimeTool = {
  name: string;
  status: AgentRuntimeToolStatus;
  detail?: string;
};

export type AgentRuntimeReply =
  | {
      ok: true;
      text: string;
      // Optional streaming hint + tool metadata reported by the agent endpoint.
      streaming?: boolean;
      tools?: AgentRuntimeTool[];
      raw: unknown;
    }
  | { ok: false; code: "agent_unreachable" | "agent_bad_response"; detail: string };

// One target agent for broadcast: its registered endpoint + identity for labeling.
export type AgentRuntimeTarget = {
  agentId: string;
  agentName: string;
  endpointUrl: string;
};

export type AgentRuntimeBroadcastInput = {
  targets: AgentRuntimeTarget[];
  message: string;
  context?: AgentRuntimeMessageContext;
};

export type AgentRuntimeBroadcastResult = {
  agentId: string;
  agentName: string;
  reply: AgentRuntimeReply;
};

export interface AgentRuntimeTransport {
  readonly mode: AgentRuntimeMode;
  // Send to a single agent endpoint.
  sendMessage(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply>;
  // Alias of sendMessage, named for the multi-agent routing layer.
  sendMessageToAgent(input: AgentRuntimeMessageInput): Promise<AgentRuntimeReply>;
  // Fan out one message to many agents; each result is independent.
  broadcastMessage(input: AgentRuntimeBroadcastInput): Promise<AgentRuntimeBroadcastResult[]>;
}

// Runtime event model. These describe an agent turn's lifecycle and are the
// reusable contract a future `ProductionRuntime` (and a real streaming transport)
// will emit. Today the SandboxRuntime returns a single reply and the sandbox UI
// SIMULATES this sequence client-side; no SSE/websocket exists yet.
export type AgentRuntimeEventType =
  | "thinking"
  | "streaming"
  | "tool_start"
  | "tool_complete"
  | "response_complete"
  | "error";

export type AgentRuntimeEvent =
  | { type: "thinking" }
  | { type: "streaming"; delta: string }
  | { type: "tool_start"; tool: AgentRuntimeTool }
  | { type: "tool_complete"; tool: AgentRuntimeTool }
  | { type: "response_complete"; text: string; tools?: AgentRuntimeTool[] }
  | { type: "error"; code: string; detail: string };
