import { NextRequest, NextResponse } from "next/server";
import {
  mapAdminAgentRecord,
  requireAdmin,
  resolveCreatorEmails,
  verificationSchemaError,
  type AdminAgentRecord,
} from "@/lib/server/agents/admin";
import { jsonError } from "@/lib/server/agents/registration";
import { runAgentVerification } from "@/lib/server/agents/verification";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Admin-triggered endpoint health check. Runs the verification service against an
// agent's registered endpoint and persists the result on the verification axis.
// This NEVER joins the agent to a room — verification only gates the developer
// sandbox.
export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const { agentId } = await context.params;
  const id = decodeURIComponent(agentId ?? "").trim();

  if (!id || !uuidPattern.test(id)) {
    return jsonError("A valid agent id is required.", 400, "invalid_agent_id");
  }

  const current = await admin.service
    .from("agents")
    .select("*")
    .eq("id", id)
    .maybeSingle<AdminAgentRecord>();

  if (current.error) {
    return verificationSchemaError(current.error);
  }

  if (!current.data) {
    return jsonError("Agent not found.", 404, "agent_not_found");
  }

  const report = await runAgentVerification({
    endpoint_url: current.data.endpoint_url,
    capabilities: current.data.capabilities ?? [],
  });

  const { data, error } = await admin.service
    .from("agents")
    .update({
      verification_status: report.status,
      verified_at: report.ok ? new Date().toISOString() : null,
      verification_note: report.checks.find((check) => !check.ok)?.detail ?? "All checks passed.",
      verification_report: report,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single<AdminAgentRecord>();

  if (error) {
    return verificationSchemaError(error);
  }

  const emails = await resolveCreatorEmails(admin.service, [data.creator_user_id]);

  return NextResponse.json({
    agent: mapAdminAgentRecord(data, emails.get(data.creator_user_id) ?? null),
    report,
  });
}
