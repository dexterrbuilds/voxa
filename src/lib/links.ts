const configuredBetaUrl = import.meta.env.VITE_BETA_URL?.trim();

export const BETA_APP_URL =
  configuredBetaUrl ||
  "http://localhost:3000";

export const AGENTS_URL = `${BETA_APP_URL.replace(/\/$/, "")}/agents`;
