import type {
  AgentCapability,
  AgentContext,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentStatus,
} from "./types";

export abstract class VoxaAgent {
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
    capabilities?: AgentCapability[];
    status?: AgentStatus;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.avatar = options.avatar;
    this.capabilities = options.capabilities ?? [];
    this.status = options.status ?? "idle";
  }

  async onJoin(_context: AgentContext): Promise<AgentResponse> {
    this.setStatus("in_room");
    return { status: this.status };
  }

  async onLeave(_context: AgentContext): Promise<AgentResponse> {
    this.setStatus("idle");
    return { status: this.status };
  }

  abstract onMessage(message: AgentMessage, context: AgentContext): Promise<AgentResponse>;

  async say(text: string): Promise<AgentResponse> {
    this.setStatus("speaking");
    return { text, status: this.status };
  }

  setStatus(status: AgentStatus) {
    this.status = status;
  }
}
