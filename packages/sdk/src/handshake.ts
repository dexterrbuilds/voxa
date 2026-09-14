import type { AgentCapability, AgentPermission } from "./types.js";
import { legacyProtocol } from "./protocol-compatibility.js";

// Synq agent handshake contract.
//
// An external agent endpoint must answer a handshake probe so Synq can verify it
// is reachable, speaks a compatible SDK version, and reports the capabilities the
// developer declared at registration. Synq's endpoint health check (server-side)
// POSTs `{ type: "synq.handshake" }` and expects an `AgentHandshake` JSON body.
//
// This is contract-only in v0.1. Implementing the handshake does NOT make an
// agent live in rooms; it only makes the agent eligible for the developer
// sandbox after review + verification.

export const SYNQ_AGENT_PROTOCOL = "synq-agent";
export const SYNQ_SDK_VERSION = "0.1";
export const SUPPORTED_SDK_VERSIONS = ["0.1"] as const;

export type AgentHandshake = {
  protocol: typeof SYNQ_AGENT_PROTOCOL | typeof legacyProtocol;
  sdkVersion: string;
  agent: {
    // `id` is optional in the handshake: Synq already knows the agent id from the
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

export function createAgentHandshake(
  input: {
    id?: string;
    name?: string;
    description?: string;
    capabilities?: AgentCapability[];
    permissions?: AgentPermission[];
    sdkVersion?: string;
  },
  protocol: AgentHandshake["protocol"] = SYNQ_AGENT_PROTOCOL,
): AgentHandshake {
  return {
    protocol,
    sdkVersion: input.sdkVersion ?? SYNQ_SDK_VERSION,
    agent: {
      id: input.id,
      name: input.name,
      description: input.description,
      capabilities: input.capabilities ?? [],
      permissions: input.permissions,
    },
  };
}
