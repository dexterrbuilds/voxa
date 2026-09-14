import type {
  AgentCapability,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentRuntimeContext,
  AgentStatus,
} from "./types";

export interface Agent {
  id: AgentId;
  name: string;
  description: string;
  avatar?: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  joinRoom(roomId: string, context: AgentRuntimeContext): Promise<AgentResponse>;
  leaveRoom(roomId: string, context: AgentRuntimeContext): Promise<AgentResponse>;
  handleMessage(message: AgentMessage, context: AgentRuntimeContext): Promise<AgentResponse>;
  speak(text: string, context: AgentRuntimeContext): Promise<AgentResponse>;
  setStatus(status: AgentStatus): void;
}

export abstract class BaseAgent implements Agent {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly avatar?: string;
  readonly capabilities: AgentCapability[];
  status: AgentStatus;

  protected constructor(options: {
    id: AgentId;
    name: string;
    description: string;
    avatar?: string;
    capabilities: AgentCapability[];
    status?: AgentStatus;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.avatar = options.avatar;
    this.capabilities = options.capabilities;
    this.status = options.status ?? "idle";
  }

  async joinRoom(roomId: string, _context: AgentRuntimeContext): Promise<AgentResponse> {
    this.setStatus("in_room");
    return {
      status: this.status,
      metadata: { agentId: this.id, roomId },
    };
  }

  async leaveRoom(roomId: string, _context: AgentRuntimeContext): Promise<AgentResponse> {
    this.setStatus("idle");
    return {
      status: this.status,
      metadata: { agentId: this.id, roomId },
    };
  }

  abstract handleMessage(
    message: AgentMessage,
    context: AgentRuntimeContext,
  ): Promise<AgentResponse>;

  async speak(text: string, _context: AgentRuntimeContext): Promise<AgentResponse> {
    this.setStatus("speaking");
    return {
      text,
      status: this.status,
      metadata: { agentId: this.id },
    };
  }

  setStatus(status: AgentStatus) {
    this.status = status;
  }
}
