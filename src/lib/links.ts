const configuredBetaUrl = import.meta.env.VITE_BETA_URL?.trim();

export const BETA_APP_URL =
  configuredBetaUrl ||
  (import.meta.env.DEV ? "http://localhost:3000" : "https://beta.usevoxa.tech");

export const AGENTS_URL = `${BETA_APP_URL.replace(/\/$/, "")}/agents`;
