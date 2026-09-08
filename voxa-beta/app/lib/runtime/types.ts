export type AgentId = string;

export type AgentStatus = "idle" | "in_room" | "listening" | "thinking" | "speaking" | "error";

export type AgentCapability =
  | "voice"
  | "memory"
  | "multilingual"
  | "web_search"
  | "realtime_room_participation"
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

export type AgentRuntimeContext = {
  roomId: string;
  requesterId?: string;
  requesterEmail?: string;
  requestId?: string;
  source?: "room" | "api" | "sdk" | string;
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
