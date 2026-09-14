import { NextRequest, NextResponse } from "next/server";
import { privyIdentityProvider } from "./privy";
import { ownerDatabase } from "./rls";
import { embeddedWallet, type SynqIdentity } from "@/lib/identity/wallet";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { SetupError, missingSchema } from "@/lib/setup-errors";
import { setupResponse } from "@/lib/server/readiness";

const failure = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
export async function verifiedSynqSession(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) return failure("Please sign in again.", 401);
  if (!process.env.PRIVY_APP_SECRET || !process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    return setupResponse(new SetupError("auth_configuration"));
  let claims;
  try {
    claims = await privyIdentityProvider.verify(token);
  } catch {
    return failure("Your session has expired. Please sign in again.", 401);
  }
  if (
    typeof claims.user_id !== "string" ||
    !claims.user_id.startsWith("did:privy:") ||
    !claims.session_id ||
    claims.expiration * 1000 <= Date.now()
  )
    return failure("Please sign in again.", 401);
  if (!checkRateLimit(`synq-auth:${claims.user_id}`, 120, 60000).allowed)
    return failure("Please wait a moment before trying again.", 429);
  let db;
  try {
    db = getServiceRoleClient();
  } catch {
    return setupResponse(new SetupError("database_configuration"));
  }
  if (!db) return setupResponse(new SetupError("database_configuration"));
  return { db, claims };
}
export async function requireSynqUser(request: NextRequest) {
  const session = await verifiedSynqSession(request);
  if (session instanceof NextResponse) return session;
  const { db, claims } = session;
  try {
    const revoked = await db
      .from("synq_revoked_sessions")
      .select("session_id")
      .eq("session_id", claims.session_id)
      .maybeSingle();
    if (revoked.error)
      throw new SetupError(
        missingSchema(revoked.error) ? "database_migration_required" : "database_configuration",
      );
    if (revoked.data) return failure("Please sign in again.", 401);
    const profile = await privyIdentityProvider.user(claims.user_id, request.signal);
    if (profile.id !== claims.user_id) return failure("Please sign in again.", 401);
    const existing = await db
      .from("synq_users")
      .select("wallet_address")
      .eq("privy_user_id", claims.user_id)
      .maybeSingle();
    if (existing.error)
      throw new SetupError(
        missingSchema(existing.error) ? "database_migration_required" : "database_configuration",
      );
    const address = embeddedWallet(profile.linked_accounts, existing.data?.wallet_address);
    const mapped = await db.rpc("synq_resolve_identity", {
      p_privy: claims.user_id,
      p_wallet: address,
    });
    if (missingSchema(mapped.error)) throw new SetupError("database_migration_required");
    if (mapped.error || !mapped.data?.id) throw new Error("identity_unavailable");
    const email = profile.linked_accounts.find((a) => a.type === "email");
    const user: SynqIdentity = {
      id: mapped.data.id,
      email: email?.type === "email" ? email.address : undefined,
      wallet: address
        ? { address, chain: "solana", provider: "privy", access: ["read", "propose"] }
        : null,
    };
    const readDb = await ownerDatabase(user.id);
    return { user, db, readDb, privyId: claims.user_id, sessionId: claims.session_id };
  } catch (error) {
    if (error instanceof SetupError) return setupResponse(error);
    console.warn("synq_identity", { status: "unavailable" });
    return failure("Your account or wallet could not be loaded. Try again in a moment.", 503);
  }
}
