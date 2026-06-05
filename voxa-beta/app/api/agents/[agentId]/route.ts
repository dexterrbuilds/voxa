import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  mapAgentRecord,
  parseRegistrationBody,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    agentId: string;
  }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAgentRecord(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return { response: auth };
  }

  const { agentId } = await context.params;
  const agentKey = decodeURIComponent(agentId ?? "").trim();

  if (!agentKey) {
    return { response: jsonError("Agent id is required.", 400, "missing_agent_id") };
  }

  const query = auth.supabase.from("agents").select("*").eq("creator_user_id", auth.user.id);
  const result = uuidPattern.test(agentKey)
    ? await query.eq("id", agentKey).maybeSingle<AgentRegistrationRecord>()
    : await query.eq("slug", agentKey).maybeSingle<AgentRegistrationRecord>();

  if (result.error) {
    return { response: registryStorageError(result.error) };
  }

  if (!result.data) {
    return { response: jsonError("Agent not found.", 404, "agent_not_found") };
  }

  return { auth, record: result.data };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await getAgentRecord(request, context);
  if ("response" in result) {
    return result.response;
  }

  return NextResponse.json({ agent: mapAgentRecord(result.record) });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await getAgentRecord(request, context);
  if ("response" in result) {
    return result.response;
  }

  if (result.record.status !== "draft" && result.record.status !== "pending_review") {
    return jsonError(
      "Only draft or pending review agents can be edited by developers.",
      409,
      "agent_not_editable",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  let parsed;
  try {
    parsed = parseRegistrationBody(body, "update");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid agent update request.",
      400,
      "invalid_agent_update",
    );
  }

  const updatePayload = {
    ...parsed,
    updated_at: new Date().toISOString(),
  };

  if (Object.keys(parsed).length === 0) {
    return jsonError("No supported agent fields were provided.", 400, "empty_agent_update");
  }

  const { data, error } = await result.auth.supabase
    .from("agents")
    .update(updatePayload)
    .eq("id", result.record.id)
    .eq("creator_user_id", result.auth.user.id)
    .select("*")
    .single<AgentRegistrationRecord>();

  if (error) {
    if (error.code === "23505") {
      return jsonError("An agent with this slug already exists.", 409, "agent_slug_taken");
    }

    return registryStorageError(error);
  }

  return NextResponse.json({ agent: mapAgentRecord(data) });
}
