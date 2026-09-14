import type { AgentIdentity } from "@/lib/runtime";
import { NOVA_AGENT_ID, NOVA_AGENT_IDENTITY } from "./nova";

export type AgentAvailability = "available" | "coming_soon";

export type AgentManifestEntry = AgentIdentity & {
  availability: AgentAvailability;
  category: string;
  firstParty: boolean;
  default?: boolean;
  participantType: "agent";
  shortLabel?: string;
  tags?: string[];
  /**
   * Legacy compatibility: room_participants.user_id currently stores the agent id
   * (for Nova, "nova"). Keep this stable until the database gains a dedicated
   * agent identity column.
   */
  participantUserId: string;
  routes?: {
    dispatch?: string;
    respond?: string;
  };
};

const firstPartyAgents: AgentManifestEntry[] = [
  {
    ...NOVA_AGENT_IDENTITY,
    availability: "available",
    category: "Conversation",
    firstParty: true,
    default: true,
    participantType: "agent",
    participantUserId: NOVA_AGENT_ID,
    shortLabel: "Live voice",
    tags: ["voice", "memory", "search"],
    routes: {
      dispatch: "/api/agents/nova/dispatch",
      respond: "/api/agents/nova/respond",
    },
  },
  {
    id: "research-agent",
    name: "Research Agent",
    description: "Finds sources, summarizes context, and brings cited research into the room.",
    availability: "coming_soon",
    category: "Research",
    firstParty: true,
    participantType: "agent",
    participantUserId: "research-agent",
    shortLabel: "Research",
    capabilities: ["web_search", "summaries", "citations"],
    tags: ["sources", "summaries", "citations"],
    metadata: {
      participantType: "agent",
      runtimePath: "future-first-party",
    },
  },
  {
    id: "meeting-summarizer",
    name: "Meeting Summarizer",
    description: "Captures decisions, action items, and room context after a conversation.",
    availability: "coming_soon",
    category: "Productivity",
    firstParty: true,
    participantType: "agent",
    participantUserId: "meeting-summarizer",
    shortLabel: "Summary",
    capabilities: ["transcript_summary", "action_items", "memory"],
    tags: ["recap", "actions", "memory"],
    metadata: {
      participantType: "agent",
      runtimePath: "future-first-party",
    },
  },
  {
    id: "code-assistant",
    name: "Code Assistant",
    description:
      "Reviews code, debugs implementation details, and helps reason through architecture.",
    availability: "coming_soon",
    category: "Engineering",
    firstParty: true,
    participantType: "agent",
    participantUserId: "code-assistant",
    shortLabel: "Code",
    capabilities: ["code_review", "debugging", "architecture"],
    tags: ["review", "debugging", "architecture"],
    metadata: {
      participantType: "agent",
      runtimePath: "future-first-party",
    },
  },
];

function cloneAgent(agent: AgentManifestEntry): AgentManifestEntry {
  return {
    ...agent,
    capabilities: [...agent.capabilities],
    permissions: agent.permissions ? [...agent.permissions] : undefined,
    metadata: agent.metadata ? { ...agent.metadata } : undefined,
    routes: agent.routes ? { ...agent.routes } : undefined,
    tags: agent.tags ? [...agent.tags] : undefined,
  };
}

export function getAvailableAgents() {
  return firstPartyAgents.map(cloneAgent);
}

export function getAgentById(agentId: string) {
  const agent = firstPartyAgents.find((candidate) => candidate.id === agentId);
  return agent ? cloneAgent(agent) : null;
}

export function isFirstPartyAgent(agentId: string) {
  return firstPartyAgents.some((agent) => agent.id === agentId && agent.firstParty);
}

export function getDefaultAgent() {
  const agent = firstPartyAgents.find((candidate) => candidate.default) ?? firstPartyAgents[0];
  return agent ? cloneAgent(agent) : null;
}

export function getAgentParticipantUserId(agentId: string) {
  return getAgentById(agentId)?.participantUserId ?? agentId;
}
