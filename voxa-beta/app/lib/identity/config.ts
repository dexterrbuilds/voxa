// Production always uses Privy. Legacy forms are an explicit local development escape hatch.
export function isLegacyAuthSelected(
  provider: string | undefined,
  legacy: string | undefined,
  environment: string | undefined,
) {
  return environment !== "production" && provider === "supabase" && legacy === "true";
}
export const privyEnabled = !isLegacyAuthSelected(
  process.env.NEXT_PUBLIC_SYNQ_AUTH_PROVIDER,
  process.env.NEXT_PUBLIC_SYNQ_LEGACY_AUTH_ENABLED,
  process.env.NODE_ENV,
);
export const privySetupMessage = "Privy authentication is not configured in this environment.";
