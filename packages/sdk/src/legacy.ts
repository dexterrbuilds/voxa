/** Deprecated compatibility exports. New integrations use the Synq names. */
export { SynqAgent as VoxaAgent } from "./SynqAgent.js";
export { createSynqAgent as createVoxaAgent } from "./adapter.js";
export type { SynqAdapterOptions as VoxaAdapterOptions } from "./adapter.js";
export type {
  SynqMessageContext as VoxaMessageContext,
  SynqMessageHistoryTurn as VoxaMessageHistoryTurn,
  SynqMessageResponse as VoxaMessageResponse,
  SynqVoiceContext as VoxaVoiceContext,
  SynqVoiceResponse as VoxaVoiceResponse,
} from "./messaging.js";
import type { SynqMessageContext, SynqVoiceContext } from "./messaging.js";
export const VOXA_AGENT_PROTOCOL = "voxa-agent";
export const VOXA_SDK_VERSION = "0.1";
export const VOXA_MESSAGE_TYPE = "voxa.message";
export const VOXA_VOICE_TYPE = "voxa.voice";
export type VoxaMessageRequest = {
  type: typeof VOXA_MESSAGE_TYPE;
  message: string;
  context?: SynqMessageContext;
};
export type VoxaVoiceRequest = {
  type: typeof VOXA_VOICE_TYPE;
  message: string;
  context?: SynqVoiceContext;
};
export function createVoxaMessageRequest(
  message: string,
  context?: SynqMessageContext,
): VoxaMessageRequest {
  return { type: VOXA_MESSAGE_TYPE, message, context };
}
export function createVoxaVoiceRequest(
  message: string,
  context?: SynqVoiceContext,
): VoxaVoiceRequest {
  return { type: VOXA_VOICE_TYPE, message, context };
}
