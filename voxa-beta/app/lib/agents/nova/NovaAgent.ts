import { BaseAgent } from "@/lib/runtime";
import type {
  AgentCapability,
  AgentIdentity,
  AgentMessage,
  AgentResponse,
  AgentRuntimeContext,
} from "@/lib/runtime";

export const NOVA_AGENT_ID = "nova";
export const NOVA_AGENT_NAME = "Nova";

export const NOVA_AGENT_CAPABILITIES: AgentCapability[] = [
  "voice",
  "memory",
  "multilingual",
  "web_search",
  "realtime_room_participation",
];

export const NOVA_AGENT_IDENTITY: AgentIdentity = {
  id: NOVA_AGENT_ID,
  name: NOVA_AGENT_NAME,
  description: "First-party Voxa conversational agent",
  creator: "Voxa",
  version: "0.1.0",
  capabilities: NOVA_AGENT_CAPABILITIES,
  permissions: ["room:join", "room:leave", "message:read", "message:write", "voice:speak"],
  metadata: {
    dispatchName: NOVA_AGENT_ID,
    participantIdentity: `agent:${NOVA_AGENT_ID}`,
    participantType: "agent",
    runtimePath: "path-a-turn-based",
  },
};

export class NovaAgent extends BaseAgent {
  constructor() {
    super({
      id: NOVA_AGENT_IDENTITY.id,
      name: NOVA_AGENT_IDENTITY.name,
      description: NOVA_AGENT_IDENTITY.description,
      avatar: NOVA_AGENT_IDENTITY.avatar,
      capabilities: NOVA_AGENT_IDENTITY.capabilities,
    });
  }

  async handleMessage(
    message: AgentMessage,
    _context: AgentRuntimeContext,
  ): Promise<AgentResponse> {
    this.setStatus("thinking");

    return {
      status: this.status,
      metadata: {
        agentId: this.id,
        messageId: message.id,
        pipeline: "POST /api/agents/nova/respond",
        wired: false,
      },
    };
  }
}
