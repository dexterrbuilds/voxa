import { NextRequest, NextResponse } from "next/server";
import {
  mapAdminAgentRecord,
  requireAdmin,
  resolveCreatorEmails,
  reviewSchemaError,
  type AdminAgentRecord,
} from "@/lib/server/agents/admin";
import { jsonError } from "@/lib/server/agents/registration";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// PATCH /api/admin/agents/:id/permissions  { action }
//
// ADMIN-ONLY grant/revoke of the special `room_voice_beta` permission. This is
// the ONLY way that permission can enter an agent's record — it is never
// developer-requestable and is stripped from developer registration payloads.
// Granting it does NOT give the agent room audio, LiveKit, or transcripts; it
// only makes the agent eligible for the private push-to-talk voice beta (still
// behind the EXPERIMENTAL_EXTERNAL_AGENT_VOICE flag).
const VOICE_BETA_PERMISSION = "room_voice_beta";

type PermissionAction = "grant_voice_beta" | "revoke_voice_beta";

function isPermissionAction(value: unknown): value is PermissionAction {
  return value === "grant_voice_beta" || value === "revoke_voice_beta";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const { agentId } = await context.params;
  const id = decodeURIComponent(agentId ?? "").trim();
  if (!id || !uuidPattern.test(id)) {
    return jsonError("A valid agent id is required.", 400, "invalid_agent_id");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const { action } = (body ?? {}) as { action?: unknown };
  if (!isPermissionAction(action)) {
    return jsonError(
      "action must be grant_voice_beta or revoke_voice_beta.",
      400,
      "invalid_permission_action",
    );
  }

  const current = await admin.service
    .from("agents")
    .select("*")
    .eq("id", id)
    .maybeSingle<AdminAgentRecord>();

  if (current.error) {
    return reviewSchemaError(current.error);
  }
  if (!current.data) {
    return jsonError("Agent not found.", 404, "agent_not_found");
  }

  const existing = new Set(current.data.permissions ?? []);
  if (action === "grant_voice_beta") {
    existing.add(VOICE_BETA_PERMISSION);
  } else {
    existing.delete(VOICE_BETA_PERMISSION);
  }

  const { data, error } = await admin.service
    .from("agents")
    .update({ permissions: [...existing], updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single<AdminAgentRecord>();

  if (error) {
    return reviewSchemaError(error);
  }

  const emails = await resolveCreatorEmails(admin.service, [data.creator_user_id]);
  return NextResponse.json({
    agent: mapAdminAgentRecord(data, emails.get(data.creator_user_id) ?? null),
  });
}
