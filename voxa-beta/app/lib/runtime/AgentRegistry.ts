import type { Agent } from "./Agent";
import type { AgentId } from "./types";

export class AgentRegistry {
  private readonly agents = new Map<AgentId, Agent>();

  register(agent: Agent) {
    this.agents.set(agent.id, agent);
    return agent;
  }

  unregister(agentId: AgentId) {
    return this.agents.delete(agentId);
  }

  get(agentId: AgentId) {
    return this.agents.get(agentId) ?? null;
  }

  list() {
    return Array.from(this.agents.values());
  }

  has(agentId: AgentId) {
    return this.agents.has(agentId);
  }
}
