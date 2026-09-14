import { NextRequest, NextResponse } from "next/server";
import {
  mapAdminAgentRecord,
  requireAdmin,
  resolveCreatorEmails,
  reviewSchemaError,
  reviewTransitions,
  type AdminAgentRecord,
  type ReviewAction,
} from "@/lib/server/agents/admin";
import { jsonError } from "@/lib/server/agents/registration";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isReviewAction(value: unknown): value is ReviewAction {
  return (
    value === "approve" || value === "reject" || value === "disable" || value === "return_to_review"
  );
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

  const { action, note } = (body ?? {}) as { action?: unknown; note?: unknown };

  if (!isReviewAction(action)) {
    return jsonError(
      "action must be one of approve, reject, disable, or return_to_review.",
      400,
      "invalid_review_action",
    );
  }

  const reviewNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;

  // Read the current record (service-role bypasses RLS).
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

  const transition = reviewTransitions[action];
  if (!transition.from.includes(current.data.status)) {
    return jsonError(
      `Cannot ${action} an agent in "${current.data.status}" status.`,
      409,
      "invalid_status_transition",
    );
  }

  const { data, error } = await admin.service
    .from("agents")
    .update({
      status: transition.to,
      reviewed_by: admin.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
      updated_at: new Date().toISOString(),
    })
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
