import type { Agent } from "./Agent";
import { AgentRegistry } from "./AgentRegistry";
import type { AgentId, AgentMessage, AgentRuntimeContext } from "./types";

export class AgentRuntime {
  private readonly registry: AgentRegistry;

  constructor(registry = new AgentRegistry()) {
    this.registry = registry;
  }

  registerAgent(agent: Agent) {
    return this.registry.register(agent);
  }

  unregisterAgent(agentId: AgentId) {
    return this.registry.unregister(agentId);
  }

  getAgent(agentId: AgentId) {
    return this.registry.get(agentId);
  }

  listAgents() {
    return this.registry.list();
  }

  async joinAgentToRoom(agentId: AgentId, roomId: string, context: AgentRuntimeContext) {
    const agent = this.requireAgent(agentId);
    return agent.joinRoom(roomId, context);
  }

  async removeAgentFromRoom(agentId: AgentId, roomId: string, context: AgentRuntimeContext) {
    const agent = this.requireAgent(agentId);
    return agent.leaveRoom(roomId, context);
  }

  async dispatchMessage(agentId: AgentId, message: AgentMessage, context: AgentRuntimeContext) {
    const agent = this.requireAgent(agentId);
    return agent.handleMessage(message, context);
  }

  private requireAgent(agentId: AgentId) {
    const agent = this.registry.get(agentId);

    if (!agent) {
      throw new Error(`Agent "${agentId}" is not registered.`);
    }

    return agent;
  }
}
