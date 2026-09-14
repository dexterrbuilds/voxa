import { importJWK, SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";
import { SetupError } from "@/lib/setup-errors";

// A dedicated ES256 key imported into Supabase, NOT a wallet key or service-role token.
// The resulting short-lived authenticated token never leaves the server.
export async function ownerDatabase(id: string) {
  let jwk;
  try {
    jwk = JSON.parse(process.env.SUPABASE_AUTH_BRIDGE_JWK || "null");
  } catch {
    throw new SetupError("database_configuration");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!jwk?.kid || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !url || !anon)
    throw new SetupError("database_configuration");
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid })
    .setSubject(id)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(await importJWK(jwk, "ES256"));
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
