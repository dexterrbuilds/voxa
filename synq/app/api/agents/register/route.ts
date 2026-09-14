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

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  let parsed;
  try {
    parsed = parseRegistrationBody(body, "create");
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid agent registration request.",
      400,
      "invalid_agent_registration",
    );
  }

  const { data, error } = await auth.supabase
    .from("agents")
    .insert({
      ...parsed,
      creator_user_id: auth.user.id,
    })
    .select("*")
    .single<AgentRegistrationRecord>();

  if (error) {
    if (error.code === "23505") {
      return jsonError("An agent with this slug already exists.", 409, "agent_slug_taken");
    }

    return registryStorageError(error);
  }

  return NextResponse.json({ agent: mapAgentRecord(data) }, { status: 201 });
}
