export * from "@synq/sdk";
import { createAgentHandshake as canonicalHandshake } from "@synq/sdk";
import { VOXA_AGENT_PROTOCOL as legacyProtocol } from "@synq/sdk";
export function createAgentHandshake(input) {
  return { ...canonicalHandshake(input), protocol: legacyProtocol };
}
