import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  normalizeSupabaseUrl,
  registryStorageError,
  type AgentRegistrationRecord,
  type AgentRegistrationStatus,
} from "@/lib/server/agents/registration";

// Admin review tooling for submitted agents. This is intentionally separate from
// the developer-facing registration routes:
//
// - Developer routes use the anon client + the user's bearer token, so RLS scopes
//   them to their own draft/pending_review records.
// - Admin routes must read OTHER users' agents and move them into statuses RLS
//   blocks (approved/disabled). They authenticate the caller against ADMIN_EMAILS
//   (server-only) and then use a service-role client to bypass RLS.
//
// Approving an agent here does NOT make it available in a live room. External
// agents stay out of the Agent Selector and rooms until a DB-backed runtime
// registry is intentionally enabled.

export type AdminAgentRecord = AgentRegistrationRecord & {
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

export type AdminContext = {
  service: SupabaseClient;
  user: User;
};

export type ReviewAction = "approve" | "reject" | "disable" | "return_to_review";

// Allowed status transitions. Each action lists the statuses it may move FROM and
// the single status it moves TO. Anything else is rejected with 409.
export const reviewTransitions: Record<
  ReviewAction,
  { from: AgentRegistrationStatus[]; to: AgentRegistrationStatus }
> = {
  approve: { from: ["pending_review", "disabled"], to: "approved" },
  reject: { from: ["pending_review"], to: "rejected" },
  disable: { from: ["approved"], to: "disabled" },
  return_to_review: { from: ["rejected"], to: "pending_review" },
};

export const reviewableStatuses: AgentRegistrationStatus[] = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "disabled",
];

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }
  return getAdminEmails().includes(email.toLowerCase());
}

function getServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(normalizeSupabaseUrl(supabaseUrl), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Validate that the caller is signed in AND in ADMIN_EMAILS, then hand back a
// service-role client for privileged data access. Returns a NextResponse on any
// failure so routes can `if (admin instanceof NextResponse) return admin;`.
export async function requireAdmin(request: NextRequest): Promise<AdminContext | NextResponse> {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!isAdminEmail(auth.user.email)) {
    return jsonError("Admin access is required for this action.", 403, "not_admin");
  }

  const service = getServiceRoleClient();
  if (!service) {
    return jsonError(
      "Admin review is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
      500,
      "admin_not_configured",
    );
  }

  return { service, user: auth.user };
}

export function isMissingReviewColumns(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  return (
    code === "PGRST204" || code === "42703" || /reviewed_by|reviewed_at|review_note/i.test(message)
  );
}

// Surface a clear hint if the additive review columns have not been applied yet,
// otherwise fall back to the shared registry storage error.
export function reviewSchemaError(error: unknown) {
  if (isMissingReviewColumns(error)) {
    return jsonError(
      "Agent review storage is not ready. Run supabase-agent-review-schema.sql in Supabase first.",
      503,
      "agent_review_not_ready",
    );
  }
  return registryStorageError(error);
}

export function isMissingVerificationColumns(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /verification_status|verified_at|verification_note|verification_report/i.test(message)
  );
}

export function verificationSchemaError(error: unknown) {
  if (isMissingVerificationColumns(error)) {
    return jsonError(
      "Agent verification storage is not ready. Run supabase-agent-verification-schema.sql in Supabase first.",
      503,
      "agent_verification_not_ready",
    );
  }
  return registryStorageError(error);
}

export function mapAdminAgentRecord(record: AdminAgentRecord, creatorEmail: string | null) {
  return {
    avatarUrl: record.avatar_url,
    capabilities: record.capabilities ?? [],
    createdAt: record.created_at,
    creatorEmail,
    creatorUserId: record.creator_user_id,
    creatorWalletAddress: record.creator_wallet_address,
    description: record.description,
    endpointUrl: record.endpoint_url,
    id: record.id,
    metadata: record.metadata ?? {},
    name: record.name,
    permissions: record.permissions ?? [],
    reviewNote: record.review_note,
    reviewedAt: record.reviewed_at,
    reviewedBy: record.reviewed_by,
    slug: record.slug,
    status: record.status,
    tags: record.tags ?? [],
    updatedAt: record.updated_at,
    verificationNote: record.verification_note ?? null,
    verificationReport: record.verification_report ?? {},
    verificationStatus: record.verification_status ?? "verification_pending",
    verifiedAt: record.verified_at ?? null,
    visibility: record.visibility,
  };
}

// Best-effort resolution of creator emails via the service-role admin API. Never
// throws: an unresolved email simply comes back as null.
export async function resolveCreatorEmails(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  const unique = [...new Set(userIds.filter(Boolean))];

  await Promise.all(
    unique.map(async (userId) => {
      try {
        const { data, error } = await service.auth.admin.getUserById(userId);
        emails.set(userId, error ? null : (data.user?.email ?? null));
      } catch {
        emails.set(userId, null);
      }
    }),
  );

  return emails;
}
