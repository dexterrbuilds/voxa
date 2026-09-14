import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  mapAgentRecord,
  registryStorageError,
  type AgentRegistrationRecord,
} from "@/lib/server/agents/registration";
import { loadAgentAnalyticsMap } from "@/lib/server/agents/analytics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  // External/public marketplace listings are intentionally disabled. For now,
  // developers can only list their own submitted agent metadata.
  const { data, error } = await auth.supabase
    .from("agents")
    .select("*")
    .eq("creator_user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .returns<AgentRegistrationRecord[]>();

  if (error) {
    return registryStorageError(error);
  }

  const analytics = await loadAgentAnalyticsMap(
    auth.supabase,
    auth.user.id,
    data.map((agent) => agent.id),
  );

  return NextResponse.json({
    agents: data.map((agent) => mapAgentRecord(agent, analytics.get(agent.id))),
  });
}
