import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase } from "@/lib/server/agents/registration";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { privyEnabled } from "@/lib/identity/config";
import { requireSynqUser } from "@/lib/server/identity/access";
import { novaSchemaStatus, setupResponse } from "@/lib/server/readiness";
import { SetupError, missingSchema } from "@/lib/setup-errors";
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function launchAccess(request: NextRequest) {
  if (privyEnabled) {
    const auth = await requireSynqUser(request);
    if (auth instanceof NextResponse) return auth;
    const setup = await novaSchemaStatus(auth.db);
    if (setup) return setup;
    if (!checkRateLimit(`nova-launch:${auth.user.id}`, 60, 60000).allowed)
      return NextResponse.json(
        { error: "Please wait a moment before trying again." },
        { status: 429 },
      );
    return { ...auth, identity: auth.user };
  }
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) return auth;
  if (!checkRateLimit(`nova-launch:${auth.user.id}`, 60, 60000).allowed)
    return NextResponse.json(
      { error: "Please wait a moment before trying again." },
      { status: 429 },
    );
  let db;
  try {
    db = getServiceRoleClient();
  } catch {
    return setupResponse(new SetupError("database_configuration"));
  }
  if (!db)
    return NextResponse.json(
      { error: "Nova conversation storage is not configured." },
      { status: 503 },
    );
  const setup = await novaSchemaStatus(db);
  if (setup) return setup;
  return { db, readDb: auth.supabase, user: auth.user, identity: null };
}
export function storageError(error?: unknown) {
  return setupResponse(
    new SetupError(missingSchema(error) ? "database_migration_required" : "database_configuration"),
  );
}
