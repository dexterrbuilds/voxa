import { NextRequest, NextResponse } from "next/server";
import { requireSynqUser, verifiedSynqSession } from "@/lib/server/identity/access";
import { privyEnabled } from "@/lib/identity/config";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!privyEnabled) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  const a = await requireSynqUser(request);
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ user: a.user }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: NextRequest) {
  if (!privyEnabled) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  // Logging out must not depend on wallet loading, provisioning or the RLS signing key.
  const a = await verifiedSynqSession(request);
  if (a instanceof NextResponse) return a;
  const { error } = await a.db
    .from("synq_revoked_sessions")
    .upsert({ session_id: a.claims.session_id, privy_user_id: a.claims.user_id });
  return NextResponse.json(
    error ? { error: "Sign-out could not be completed. Try again." } : { ok: true },
    { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
