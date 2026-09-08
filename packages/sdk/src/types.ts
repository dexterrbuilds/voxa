export type AgentId = string;

export type AgentStatus = "idle" | "in_room" | "listening" | "thinking" | "speaking" | "error";

export type AgentCapability =
  | "voice"
  | "memory"
  | "multilingual"
  | "web_search"
  | "realtime_room_participation"
  // Private push-to-talk voice beta (STT in / TTS out to the user only).
  | "voice_input"
  | "voice_output"
  | (string & {});

export type AgentPermission =
  | "room:join"
  | "room:leave"
  | "message:read"
  | "message:write"
  | "voice:listen"
  | "voice:speak"
  | (string & {});

export type AgentIdentity = {
  id: AgentId;
  name: string;
  description: string;
  avatar?: string;
  creator?: string;
  version?: string;
  capabilities: AgentCapability[];
  permissions?: AgentPermission[];
  metadata?: Record<string, unknown>;
};

export type AgentContext = {
  roomId: string;
  agentId?: AgentId;
  requesterId?: string;
  requesterEmail?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export type AgentMessageRole = "human" | "agent" | "system";

export type AgentMessage = {
  id?: string;
  roomId: string;
  senderId: string;
  senderName?: string;
  role: AgentMessageRole;
  text?: string;
  audioUrl?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type AgentResponse = {
  text?: string;
  audioUrl?: string;
  status?: AgentStatus;
  metadata?: Record<string, unknown>;
  error?: string;
};

export type AgentRegistrationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "disabled";

export type AgentVisibility = "private" | "unlisted" | "public";

export type AgentVerificationStatus = "verification_pending" | "verified" | "verification_failed";

export type AgentRegistrationInput = {
  name: string;
  description: string;
  slug?: string;
  avatarUrl?: string;
  endpointUrl?: string;
  creatorWalletAddress?: string;
  status?: Extract<AgentRegistrationStatus, "draft" | "pending_review">;
  visibility?: Extract<AgentVisibility, "private" | "unlisted">;
  capabilities?: AgentCapability[];
  permissions?: AgentPermission[];
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type AgentRegistration = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorUserId: string;
  creatorWalletAddress: string | null;
  endpointUrl: string | null;
  status: AgentRegistrationStatus;
  visibility: AgentVisibility;
  capabilities: AgentCapability[];
  permissions: AgentPermission[];
  tags: string[];
  metadata: Record<string, unknown>;
  verificationStatus?: AgentVerificationStatus;
  createdAt: string;
  updatedAt: string;
};
