export type PublicAgentSource = "first_party" | "external";

export type PublicDeveloperProfile = {
  avatarUrl: string | null;
  bio: string;
  displayName: string;
  joinedAt: string | null;
  publicAgentCount?: number;
  username: string;
  website: string | null;
  xHandle: string | null;
};

export type PublicAgent = {
  avatarUrl: string | null;
  capabilities: string[];
  creatorDisplayName: string;
  creatorProfile: PublicDeveloperProfile | null;
  creatorUsername: string | null;
  description: string;
  examplePrompts: string[];
  featured: boolean;
  id: string;
  name: string;
  permissions: string[];
  slug: string;
  source: PublicAgentSource;
  tags: string[];
  updatedAt: string | null;
  verificationStatus: "verified";
};

export type PublicAgentDirectoryData = {
  agents: PublicAgent[];
  featuredAgents: PublicAgent[];
  featuredDevelopers: PublicDeveloperProfile[];
  publicExternalAgentsAvailable: boolean;
};
