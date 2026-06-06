import type { AgentVerificationStatus } from "@/lib/server/agents/registration";

// Endpoint health check service.
//
// Verifies that an external agent endpoint is reachable, speaks the Voxa agent
// handshake protocol at a compatible SDK version, and reports capabilities that
// match (or cover) what the developer declared at registration.
//
// This NEVER joins an agent to a room. It is a precondition gate for the
// developer SANDBOX only. The handshake contract below mirrors `@voxa/sdk`'s
// `createAgentHandshake()` so external developers can implement it.

// Protocol contract (mirror of packages/sdk/src/handshake.ts).
export const VOXA_AGENT_PROTOCOL = "voxa-agent";
export const SUPPORTED_SDK_VERSIONS = ["0.1"];
const HANDSHAKE_TIMEOUT_MS = 5000;

export type AgentHandshake = {
  protocol: string;
  sdkVersion: string;
  agent: {
    id?: string;
    name?: string;
    description?: string;
    capabilities: string[];
    permissions?: string[];
  };
};

export type VerificationCheck = {
  name: "endpoint_reachable" | "sdk_compatible" | "capability_payload";
  ok: boolean;
  detail: string;
};

export type VerificationReport = {
  ok: boolean;
  status: Extract<AgentVerificationStatus, "verified" | "verification_failed">;
  checks: VerificationCheck[];
  endpointUrl: string | null;
  checkedAt: string;
};

type VerifiableAgent = {
  endpoint_url: string | null;
  capabilities: string[];
};

function buildReport(checks: VerificationCheck[], endpointUrl: string | null): VerificationReport {
  const ok = checks.length > 0 && checks.every((check) => check.ok);
  return {
    ok,
    status: ok ? "verified" : "verification_failed",
    checks,
    endpointUrl,
    checkedAt: new Date().toISOString(),
  };
}

async function fetchHandshake(endpointUrl: string): Promise<
  | { ok: true; handshake: AgentHandshake }
  | { ok: false; detail: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HANDSHAKE_TIMEOUT_MS);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ type: "voxa.handshake" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, detail: `Endpoint responded with HTTP ${response.status}.` };
    }

    const payload = (await response.json().catch(() => null)) as AgentHandshake | null;
    if (!payload || typeof payload !== "object") {
      return { ok: false, detail: "Endpoint did not return a JSON handshake." };
    }

    return { ok: true, handshake: payload };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "was unreachable";
    return { ok: false, detail: `Endpoint ${reason}.` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAgentVerification(agent: VerifiableAgent): Promise<VerificationReport> {
  const endpointUrl = agent.endpoint_url?.trim() || null;

  // Check 1: endpoint present + reachable.
  if (!endpointUrl) {
    return buildReport(
      [
        {
          name: "endpoint_reachable",
          ok: false,
          detail: "No endpoint URL is registered for this agent.",
        },
      ],
      null,
    );
  }

  const handshakeResult = await fetchHandshake(endpointUrl);
  if (!handshakeResult.ok) {
    return buildReport(
      [{ name: "endpoint_reachable", ok: false, detail: handshakeResult.detail }],
      endpointUrl,
    );
  }

  const handshake = handshakeResult.handshake;
  const checks: VerificationCheck[] = [
    { name: "endpoint_reachable", ok: true, detail: "Endpoint responded to the handshake." },
  ];

  // Check 2: SDK / protocol compatibility.
  const protocolOk = handshake.protocol === VOXA_AGENT_PROTOCOL;
  const versionOk =
    typeof handshake.sdkVersion === "string" && SUPPORTED_SDK_VERSIONS.includes(handshake.sdkVersion);
  checks.push({
    name: "sdk_compatible",
    ok: protocolOk && versionOk,
    detail:
      protocolOk && versionOk
        ? `Compatible Voxa agent SDK (${handshake.sdkVersion}).`
        : !protocolOk
          ? `Unexpected protocol "${handshake.protocol ?? "none"}" (expected "${VOXA_AGENT_PROTOCOL}").`
          : `Unsupported SDK version "${handshake.sdkVersion ?? "none"}" (supported: ${SUPPORTED_SDK_VERSIONS.join(", ")}).`,
  });

  // Check 3: declared capabilities are covered by what the endpoint reports.
  const declared = agent.capabilities ?? [];
  const reported = Array.isArray(handshake.agent?.capabilities) ? handshake.agent.capabilities : [];
  const missing = declared.filter((capability) => !reported.includes(capability));
  checks.push({
    name: "capability_payload",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? declared.length > 0
          ? "Endpoint reports all declared capabilities."
          : "No capabilities declared; endpoint payload accepted."
        : `Endpoint is missing declared capabilities: ${missing.join(", ")}.`,
  });

  return buildReport(checks, endpointUrl);
}
