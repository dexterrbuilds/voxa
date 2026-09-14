export const setupMessages = {
  auth_configuration: "Privy authentication is not configured in this environment.",
  database_configuration: "Synq database configuration is required for this environment.",
  database_migration_required: "Synq database migration is required for this environment.",
  model_configuration: "Nova text responses are not configured in this environment.",
} as const;
export class SetupError extends Error {
  constructor(public readonly code: keyof typeof setupMessages) {
    super(setupMessages[code]);
  }
}
export function missingSchema(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(String(error.code))
  );
}
