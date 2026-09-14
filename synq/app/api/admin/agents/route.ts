import { NextRequest, NextResponse } from "next/server";
import {
  mapAdminAgentRecord,
  requireAdmin,
  resolveCreatorEmails,
  reviewableStatuses,
  type AdminAgentRecord,
} from "@/lib/server/agents/admin";
import { jsonError, registryStorageError } from "@/lib/server/agents/registration";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && reviewableStatuses.includes(statusParam as AdminAgentRecord["status"])
      ? statusParam
      : null;

  if (statusParam && !status) {
    return jsonError("Unknown agent status filter.", 400, "invalid_status_filter");
  }

  let query = admin.service.from("agents").select("*").order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.returns<AdminAgentRecord[]>();

  if (error) {
    return registryStorageError(error);
  }

  const emails = await resolveCreatorEmails(
    admin.service,
    data.map((record) => record.creator_user_id),
  );

  return NextResponse.json({
    agents: data.map((record) =>
      mapAdminAgentRecord(record, emails.get(record.creator_user_id) ?? null),
    ),
  });
}
