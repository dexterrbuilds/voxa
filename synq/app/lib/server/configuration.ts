// Safe setup audit: variable names and readiness only, never values. No network/database access.
export function configurationAudit(env: NodeJS.ProcessEnv = process.env) {
  const missing = (names: string[]) => names.filter((name) => !env[name]?.trim());
  const groups = {
    auth: missing(["NEXT_PUBLIC_PRIVY_APP_ID", "PRIVY_APP_SECRET"]),
    database: missing([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_AUTH_BRIDGE_JWK",
    ]),
    text: missing(["GOOGLE_API_KEY"]),
    solana:
      env.NOVA_SOLANA_ENABLED === "true" && env.NODE_ENV === "production"
        ? missing(["SOLANA_RPC_URL", "JUPITER_API_KEY"])
        : [],
    voice: missing(["DEEPGRAM_API_KEY"]),
  };
  const invalid: string[] = [];
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SOLANA_RPC_URL"]) {
    if (!env[name]) continue;
    try {
      if (new URL(env[name]).protocol !== "https:") invalid.push(name);
    } catch {
      invalid.push(name);
    }
  }
  if (env.SUPABASE_AUTH_BRIDGE_JWK) {
    try {
      const key = JSON.parse(env.SUPABASE_AUTH_BRIDGE_JWK);
      if (key.kty !== "EC" || key.crv !== "P-256" || !key.kid || !key.d)
        invalid.push("SUPABASE_AUTH_BRIDGE_JWK");
    } catch {
      invalid.push("SUPABASE_AUTH_BRIDGE_JWK");
    }
  }
  if (env.NOVA_MODEL_PROVIDER && env.NOVA_MODEL_PROVIDER !== "gemini")
    invalid.push("NOVA_MODEL_PROVIDER");
  return {
    required: { auth: groups.auth, database: groups.database },
    optional: { text: groups.text, solana: groups.solana, voice: groups.voice },
    invalid,
    executionEnabled: false,
  };
}
