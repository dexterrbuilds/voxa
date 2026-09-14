import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeRequestedPermissions } from "@/lib/agents/permissions";
import { normalizeImportSource } from "@/lib/agents/import-sources";
import { emptyAgentAnalytics, type AgentAnalyticsSummary } from "@/lib/server/agents/analytics";

export type AgentRegistrationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "disabled";

export type AgentVisibility = "private" | "unlisted" | "public";

// Verification is an axis ORTHOGONAL to the review `status` above. An agent's
// endpoint must pass the health check before it can be sandbox-tested.
export type AgentVerificationStatus = "verification_pending" | "verified" | "verification_failed";

export type AgentRegistrationInput = {
  avatarUrl?: string;
  capabilities?: string[];
  creatorWalletAddress?: string;
  description?: string;
  endpointUrl?: string;
  importSource?: string;
  importMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  name?: string;
  permissions?: string[];
  slug?: string;
  status?: AgentRegistrationStatus;
  tags?: string[];
  visibility?: AgentVisibility;
};

export type AgentRegistrationRecord = {
  avatar_url: string | null;
  capabilities: string[];
  created_at: string;
  creator_user_id: string;
  creator_wallet_address: string | null;
  description: string;
  endpoint_url: string | null;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  permissions: string[];
  slug: string;
  status: AgentRegistrationStatus;
  tags: string[];
  updated_at: string;
  visibility: AgentVisibility;
  // Verification axis (added by supabase-agent-verification-schema.sql). Optional
  // on the type so reads still work before the migration is applied.
  verification_status?: AgentVerificationStatus | null;
  verified_at?: string | null;
  verification_note?: string | null;
  verification_report?: Record<string, unknown> | null;
  // Import provenance (added by supabase-agent-import-schema.sql). Optional on the
  // type so reads still work before the migration is applied.
  import_source?: string | null;
  import_metadata?: Record<string, unknown> | null;
};

export type AuthenticatedSupabase = {
  accessToken: string;
  supabase: SupabaseClient;
  user: User;
};

const creatableStatuses = new Set<AgentRegistrationStatus>(["draft", "pending_review"]);
const editableStatuses = new Set<AgentRegistrationStatus>(["draft", "pending_review"]);
const editableVisibilities = new Set<AgentVisibility>(["private", "unlisted"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message }, { status });
}

export function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
}

function getAccessToken(request: NextRequest) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

export async function getAuthenticatedSupabase(
  request: NextRequest,
): Promise<AuthenticatedSupabase | NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Authentication is not configured yet.", 500, "auth_not_configured");
  }

  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return jsonError("Sign in before managing agents.", 401, "missing_session");
  }

  const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return jsonError("Your session expired. Sign in again.", 401, "session_expired");
  }

  return { accessToken, supabase, user };
}

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function cleanOptionalString(value: unknown, maxLength: number) {
  const cleaned = cleanString(value, maxLength);
  return cleaned || null;
}

function cleanStringArray(value: unknown, maxItems = 12, maxLength = 48) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const cleaned = cleanString(item, maxLength);
    if (cleaned) {
      unique.add(cleaned);
    }
  }

  return [...unique].slice(0, maxItems);
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 8000) {
    throw new Error("Metadata is too large.");
  }

  return JSON.parse(serialized) as Record<string, unknown>;
}

export function slugifyAgentName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validateUrl(value: string | null, fieldName: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Invalid protocol.");
    }
    return url.toString();
  } catch {
    throw new Error(`${fieldName} must be a valid http or https URL.`);
  }
}

export function parseRegistrationBody(body: unknown, mode: "create" | "update") {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid agent registration request.");
  }

  const input = body as AgentRegistrationInput;
  const has = (key: keyof AgentRegistrationInput) =>
    Object.prototype.hasOwnProperty.call(input, key);

  const name = cleanString(input.name, 120);
  const description = cleanString(input.description, 1000);
  const slug = cleanString(input.slug, 80) || (name ? slugifyAgentName(name) : "");
  const status = input.status ?? (mode === "create" ? "pending_review" : undefined);
  const visibility = input.visibility ?? (mode === "create" ? "private" : undefined);

  if (mode === "create" && !name) {
    throw new Error("Agent name is required.");
  }

  if (slug && !slugPattern.test(slug)) {
    throw new Error("Agent slug must use lowercase letters, numbers, and hyphens.");
  }

  if (mode === "create" && !slug) {
    throw new Error("Agent slug is required.");
  }

  if (status && !editableStatuses.has(status)) {
    throw new Error("Only draft or pending_review agents can be submitted by developers.");
  }

  if (mode === "create" && status && !creatableStatuses.has(status)) {
    throw new Error("Agent status must be draft or pending_review.");
  }

  if (visibility && !editableVisibilities.has(visibility)) {
    throw new Error("Public agent visibility is not available yet.");
  }

  const endpointUrl = validateUrl(cleanOptionalString(input.endpointUrl, 600), "endpointUrl");
  const avatarUrl = validateUrl(cleanOptionalString(input.avatarUrl, 600), "avatarUrl");

  if (mode === "update") {
    const parsed: Record<string, unknown> = {};

    if (has("avatarUrl")) {
      parsed.avatar_url = avatarUrl;
    }
    if (has("capabilities")) {
      parsed.capabilities = cleanStringArray(input.capabilities);
    }
    if (has("creatorWalletAddress")) {
      parsed.creator_wallet_address = cleanOptionalString(input.creatorWalletAddress, 160);
    }
    if (has("description")) {
      parsed.description = description;
    }
    if (has("endpointUrl")) {
      parsed.endpoint_url = endpointUrl;
    }
    if (has("importSource")) {
      parsed.import_source = normalizeImportSource(input.importSource);
    }
    if (has("importMetadata")) {
      parsed.import_metadata = cleanMetadata(input.importMetadata);
    }
    if (has("metadata")) {
      parsed.metadata = cleanMetadata(input.metadata);
    }
    if (has("name")) {
      if (!name) {
        throw new Error("Agent name cannot be empty.");
      }
      parsed.name = name;
    }
    if (has("permissions")) {
      // Only grantable external-agent permissions are persisted; future
      // audio/transcript permissions are never stored (defense-in-depth — the
      // runtime also drops them).
      parsed.permissions = sanitizeRequestedPermissions(cleanStringArray(input.permissions));
    }
    if (has("slug")) {
      parsed.slug = slug;
    }
    if (has("status")) {
      parsed.status = status;
    }
    if (has("tags")) {
      parsed.tags = cleanStringArray(input.tags);
    }
    if (has("visibility")) {
      parsed.visibility = visibility;
    }

    return parsed;
  }

  return {
    avatar_url: avatarUrl,
    capabilities: cleanStringArray(input.capabilities),
    creator_wallet_address: cleanOptionalString(input.creatorWalletAddress, 160),
    description,
    endpoint_url: endpointUrl,
    import_source: normalizeImportSource(input.importSource),
    import_metadata: cleanMetadata(input.importMetadata),
    metadata: cleanMetadata(input.metadata),
    name,
    permissions: sanitizeRequestedPermissions(cleanStringArray(input.permissions)),
    slug,
    status,
    tags: cleanStringArray(input.tags),
    visibility,
  };
}

export function mapAgentRecord(
  record: AgentRegistrationRecord,
  analytics: AgentAnalyticsSummary = emptyAgentAnalytics,
) {
  return {
    analytics,
    avatarUrl: record.avatar_url,
    capabilities: record.capabilities ?? [],
    createdAt: record.created_at,
    creatorUserId: record.creator_user_id,
    creatorWalletAddress: record.creator_wallet_address,
    description: record.description,
    endpointUrl: record.endpoint_url,
    id: record.id,
    importMetadata: record.import_metadata ?? {},
    importSource: normalizeImportSource(record.import_source),
    metadata: record.metadata ?? {},
    name: record.name,
    permissions: record.permissions ?? [],
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

export function isMissingAgentsTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "PGRST205"
  );
}

export function registryStorageError(error: unknown) {
  if (isMissingAgentsTable(error)) {
    return jsonError(
      "Agent registration storage is not ready. Run the agents schema in Supabase first.",
      503,
      "agent_registry_not_ready",
    );
  }

  return jsonError("Agent registration is unavailable right now.", 500, "agent_registry_error");
}
