import type { AgentCapability, AgentPermission } from "./types.js";

// Voxa agent handshake contract.
//
// An external agent endpoint must answer a handshake probe so Voxa can verify it
// is reachable, speaks a compatible SDK version, and reports the capabilities the
// developer declared at registration. Voxa's endpoint health check (server-side)
// POSTs `{ type: "voxa.handshake" }` and expects an `AgentHandshake` JSON body.
//
// This is contract-only in v0.1. Implementing the handshake does NOT make an
// agent live in rooms; it only makes the agent eligible for the developer
// sandbox after review + verification.

export const VOXA_AGENT_PROTOCOL = "voxa-agent";
export const VOXA_SDK_VERSION = "0.1";
export const SUPPORTED_SDK_VERSIONS = ["0.1"] as const;

export type AgentHandshake = {
  protocol: typeof VOXA_AGENT_PROTOCOL;
  sdkVersion: string;
  agent: {
    // `id` is optional in the handshake: Voxa already knows the agent id from the
    // registered record. The handshake only needs to report the live identity and
    // the capabilities the endpoint actually supports.
    id?: string;
    name?: string;
    description?: string;
    capabilities: AgentCapability[];
    permissions?: AgentPermission[];
  };
};

export function isSupportedSdkVersion(version: string): boolean {
  return (SUPPORTED_SDK_VERSIONS as readonly string[]).includes(version);
}

export function createAgentHandshake(input: {
  id?: string;
  name?: string;
  description?: string;
  capabilities?: AgentCapability[];
  permissions?: AgentPermission[];
  sdkVersion?: string;
}): AgentHandshake {
  return {
    protocol: VOXA_AGENT_PROTOCOL,
    sdkVersion: input.sdkVersion ?? VOXA_SDK_VERSION,
    agent: {
      id: input.id,
      name: input.name,
      description: input.description,
      capabilities: input.capabilities ?? [],
      permissions: input.permissions,
    },
  };
}
