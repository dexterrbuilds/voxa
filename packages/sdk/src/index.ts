export type {
  AgentCapability,
  AgentContext,
  AgentId,
  AgentIdentity,
  AgentMessage,
  AgentMessageRole,
  AgentPermission,
  AgentRegistration,
  AgentRegistrationInput,
  AgentRegistrationStatus,
  AgentResponse,
  AgentStatus,
  AgentVerificationStatus,
  AgentVisibility,
} from "./types.js";
export type { AgentHandshake } from "./handshake.js";
export {
  createAgentHandshake,
  isSupportedSdkVersion,
  SUPPORTED_SDK_VERSIONS,
  SYNQ_AGENT_PROTOCOL,
  SYNQ_SDK_VERSION,
} from "./handshake.js";
export type {
  AgentMessageHandler,
  AgentMessageRequest,
  AgentToolInvocation,
  AgentToolStatus,
  SynqMessageContext,
  SynqMessageHistoryTurn,
  SynqMessageRequest,
  SynqMessageResponse,
  SynqVoiceContext,
  SynqVoiceRequest,
  SynqVoiceResponse,
} from "./messaging.js";
export {
  createAgentMessageResponse,
  createSynqMessageRequest,
  createSynqVoiceRequest,
  SYNQ_MESSAGE_TYPE,
  SYNQ_VOICE_TYPE,
} from "./messaging.js";
export { defineAgentRegistration, registerAgent } from "./registration.js";
export { SynqAgent } from "./SynqAgent.js";
export { createSynqAgent } from "./adapter.js";
export type { SynqAdapterOptions } from "./adapter.js";
// Deprecated exports are isolated from the canonical implementation.
export * from "./legacy.js";
export { canonicalAgentPath, protocolForPath } from "./protocol-compatibility.js";
