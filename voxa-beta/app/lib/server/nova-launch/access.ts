import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase } from "@/lib/server/agents/registration";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { privyEnabled } from "@/lib/identity/config";
import { requireSynqUser } from "@/lib/server/identity/access";
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function launchAccess(request: NextRequest) {
  if (privyEnabled) {
    const auth = await requireSynqUser(request);
    if (auth instanceof NextResponse) return auth;
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
  const db = getServiceRoleClient();
  if (!db)
    return NextResponse.json(
      { error: "Nova conversation storage is not configured." },
      { status: 503 },
    );
  return { db, readDb: auth.supabase, user: auth.user, identity: null };
}
export function storageError() {
  return NextResponse.json(
    {
      error:
        "Conversation storage is unavailable. Please try again. The Nova launch migration must be installed.",
    },
    { status: 503 },
  );
}
