import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  fetchHandshake,
  SUPPORTED_SDK_VERSIONS,
  VOXA_AGENT_PROTOCOL,
} from "@/lib/server/agents/verification";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { normalizeImportSource } from "@/lib/agents/import-sources";
import { parseAgentEndpoint } from "@/lib/server/agents/runtime/endpoint";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) return auth;
  const limit = checkRateLimit(`agent-discover:${auth.user.id}`, 10, 60000);
  if (!limit.allowed)
    return jsonError("Please wait a moment before testing again.", 429, "rate_limited");
  let endpointUrl: string;
  try {
    const body = await request.json();
    if (typeof body?.endpointUrl !== "string" || body.endpointUrl.length > 600) throw new Error();
    endpointUrl = parseAgentEndpoint(body.endpointUrl.trim()).toString();
  } catch {
    return jsonError(
      "Enter a public HTTP or HTTPS handshake URL without embedded credentials.",
      400,
      "invalid_endpoint",
    );
  }
  const started = performance.now();
  const result = await fetchHandshake(endpointUrl, request.signal);
  if (!result.ok) return jsonError(result.detail, 422, "connection_failed");
  const handshake = result.handshake;
  if (
    handshake.protocol !== VOXA_AGENT_PROTOCOL ||
    !SUPPORTED_SDK_VERSIONS.includes(handshake.sdkVersion)
  ) {
    return jsonError(
      "The endpoint needs a Voxa-compatible adapter. Use the SDK handshake helper, then test again.",
      422,
      "incompatible_agent",
    );
  }
  const agent = handshake.agent;
  // Discovery is descriptive only: never import permissions, approval or ownership.
  return NextResponse.json(
    {
      detected: {
        name: typeof agent.name === "string" ? agent.name.slice(0, 120) : "",
        description: typeof agent.description === "string" ? agent.description.slice(0, 1000) : "",
        capabilities: [...new Set(agent.capabilities)].slice(0, 12),
        importSource: normalizeImportSource(agent.runtime),
        supports: {
          text: agent.supports?.text !== false,
          voice: agent.supports?.voice === true,
          tools: agent.supports?.tools === true,
        },
        protocol: handshake.protocol,
        sdkVersion: handshake.sdkVersion,
      },
      durationMs: Math.round(performance.now() - started),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
