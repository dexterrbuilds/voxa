import { PrivyClient } from "@privy-io/node";

let client: PrivyClient | undefined;
function getClient() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("privy_not_configured");
  return (client ??= new PrivyClient({ appId, appSecret, timeout: 8000, maxRetries: 1 }));
}
// Only authentication and user reads are exposed. Never export the full wallet-capable SDK.
export const privyIdentityProvider = {
  verify: (token: string) => getClient().utils().auth().verifyAccessToken(token),
  user: (id: string, signal: AbortSignal) => getClient().users()._get(id, { signal }),
};
