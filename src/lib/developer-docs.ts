import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Braces,
  CircleHelp,
  Compass,
  GitBranch,
  Layers3,
  LifeBuoy,
  Network,
  UserPlus,
  RadioTower,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export type DocsPageId = "overview" | "runtime" | "sdk" | "registration" | "roadmap" | "faq";

export type DocsNavItem = {
  id: DocsPageId;
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
};

export const docsNav: DocsNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    path: "/developers/docs",
    description: "What Voxa is and where the platform is going.",
    icon: Compass,
  },
  {
    id: "runtime",
    label: "Agent Runtime",
    path: "/developers/docs/runtime",
    description: "Rooms, manifests, registries, and lifecycle primitives.",
    icon: Network,
  },
  {
    id: "sdk",
    label: "SDK v0.1",
    path: "/developers/docs/sdk",
    description: "The developer-facing agent contract in preview.",
    icon: Braces,
  },
  {
    id: "registration",
    label: "Registration",
    path: "/developers/docs/registration",
    description: "How future external agents will enter Voxa safely.",
    icon: UserPlus,
  },
  {
    id: "roadmap",
    label: "Roadmap",
    path: "/developers/docs/roadmap",
    description: "What exists now and what comes next.",
    icon: GitBranch,
  },
  {
    id: "faq",
    label: "FAQ",
    path: "/developers/docs/faq",
    description: "Common questions about Nova, agents, and deployment.",
    icon: CircleHelp,
  },
];

export const runtimeFlow = [
  {
    label: "Room",
    detail: "A private real-time space where humans and agents can participate.",
    icon: RadioTower,
  },
  {
    label: "Agent Runtime",
    detail: "The orchestration layer that manages identity, status, lifecycle, and messages.",
    icon: Layers3,
  },
  {
    label: "Agents",
    detail: "First-party and future developer-owned participants that can listen, reason, and speak.",
    icon: Sparkles,
  },
] as const;

export const platformPillars = [
  {
    title: "Multi-agent rooms",
    description: "Multiple specialized agents collaborating inside the same live conversation.",
    icon: Boxes,
  },
  {
    title: "Agent identity",
    description: "Stable identities, permissions, versions, creators, and metadata for every agent.",
    icon: ShieldCheck,
  },
  {
    title: "Cross-platform deployment",
    description: "Agents joining calls, meetings, communities, and voice spaces wherever people talk.",
    icon: Route,
  },
] as const;

export const sdkExample = `import { VoxaAgent } from "@voxa/sdk";

class ResearchAgent extends VoxaAgent {
  constructor() {
    super({
      id: "research-agent",
      name: "Research Agent",
      description: "Finds and summarizes relevant information.",
      capabilities: ["web_search", "summaries", "citations"],
    });
  }

  async onMessage(message, context) {
    return {
      text: "Here is what I found...",
    };
  }
}`;

export const registrationExample = `import { defineAgentRegistration } from "@voxa/sdk";

const registration = defineAgentRegistration({
  name: "Research Agent",
  description: "Searches and summarizes live information.",
  endpointUrl: "https://agent.example.com/voxa",
  capabilities: ["web_search", "memory"],
  permissions: ["room:join", "message:read", "voice:speak"],
  tags: ["research", "summaries"],
});`;

export const runtimeExample = `Room
  ↓
Agent Runtime
  ↓
Agent Registry + Agent Manifest
  ↓
Agent Lifecycle
  ↓
Nova today, developer agents later`;

export const typeExample = `type AgentStatus =
  | "idle"
  | "in_room"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type AgentResponse = {
  text: string;
  audioUrl?: string;
  metadata?: Record<string, unknown>;
};`;

export const roadmapNow = [
  "Nova as the first first-party demonstration agent",
  "Agent Runtime foundation",
  "SDK v0.1 typed agent contract",
  "Agent Manifest and Agent Selector",
  "inviteAgent(agentId) for first-party agents",
  "Authenticated agent registration API scaffold",
] as const;

export const roadmapComing = [
  "External developer agents",
  "DB-backed agent registry",
  "Agent review and approval tooling",
  "Agent permissions and identity",
  "Agent marketplace",
  "OpenClaw support",
  "Cross-platform deployment to Meet, Zoom, X Spaces, Discord, and Slack",
] as const;

export const faqItems = [
  {
    question: "Is Nova the product?",
    answer:
      "No. Nova is the first demonstration agent running on Voxa. The product is the runtime layer that lets conversational agents join, understand, and participate in live human conversations.",
  },
  {
    question: "Can I deploy my own agent today?",
    answer:
      "Not yet. The SDK is in developer preview and external agent loading is not enabled. Voxa now has registration API scaffolding for authenticated metadata submissions, but submitted agents do not appear in rooms or the selector yet.",
  },
  {
    question: "Can agents join Zoom, Google Meet, or X Spaces?",
    answer:
      "That is the platform direction, but it is not live today. Voxa is building toward cross-platform deployment after the room runtime, registry, and SDK mature.",
  },
  {
    question: "When is the SDK launching?",
    answer:
      "The v0.1 SDK foundation exists locally in the repo as a typed contract. Public SDK access, API keys, billing, and publishing workflows are planned but not implemented yet.",
  },
  {
    question: "What should developers watch first?",
    answer:
      "Watch the Agent Runtime, Agent Manifest, SDK v0.1, inviteAgent(agentId), and the registration review queue. Those are the foundations that will eventually support developer-owned agents.",
  },
];

export const registrationFlow = [
  "Build an agent against the Voxa SDK contract.",
  "Register metadata such as name, endpoint URL, capabilities, permissions, and tags.",
  "Voxa reviews and approves the agent before users can invite it.",
  "Approved agents appear in a future Agent Selector or registry surface.",
  "Users invite approved agents into rooms by agent identity.",
] as const;

export const securityModel = [
  "Approval is required before an external agent can appear publicly.",
  "Permissions must be declared before room access is granted.",
  "Endpoint ownership and health checks must be verified.",
  "Rate limits and abuse protection must wrap registration and runtime calls.",
  "Agent identity verification will evolve toward wallet/onchain identity later.",
] as const;

export const pageMeta: Record<
  DocsPageId,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  overview: {
    eyebrow: "Developer Docs",
    title: "Build for the conversational AI runtime.",
    description:
      "Voxa is the infrastructure layer for live AI agents. These docs explain the platform direction, current runtime foundation, and upcoming SDK surface.",
  },
  runtime: {
    eyebrow: "Agent Runtime",
    title: "Rooms become programmable agent environments.",
    description:
      "The runtime coordinates room context, agent identity, registry metadata, lifecycle state, and future message dispatch.",
  },
  sdk: {
    eyebrow: "SDK v0.1",
    title: "A typed contract for developer-owned agents.",
    description:
      "The SDK is a developer-preview foundation. It defines how agents will describe identity, capabilities, lifecycle hooks, messages, and responses.",
  },
  registration: {
    eyebrow: "Agent Registration",
    title: "A safe intake path for developer-owned agents.",
    description:
      "Registration is scaffolded as an authenticated metadata review queue. External agents are still disabled until approval, permissions, identity, and runtime dispatch mature.",
  },
  roadmap: {
    eyebrow: "Roadmap",
    title: "From Nova demo to agent infrastructure.",
    description:
      "Nova is the first agent on Voxa. The roadmap expands the platform toward developer agents, identity, permissions, marketplaces, and cross-platform deployment.",
  },
  faq: {
    eyebrow: "FAQ",
    title: "Answers before the SDK opens up.",
    description:
      "A quick reference for developers evaluating Voxa’s current state and upcoming platform direction.",
  },
};

export function getDocsPageId(pathname: string): DocsPageId {
  const segment = pathname.split("/").filter(Boolean).pop();

  if (
    segment === "runtime" ||
    segment === "sdk" ||
    segment === "registration" ||
    segment === "roadmap" ||
    segment === "faq"
  ) {
    return segment;
  }

  return "overview";
}

export const supportCard = {
  title: "Developer preview",
  description:
    "External agents, API keys, billing, and marketplace publishing are not live yet. Request SDK beta access to follow availability.",
  icon: LifeBuoy,
};
