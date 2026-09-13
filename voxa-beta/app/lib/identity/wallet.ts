import { solanaAddress } from "@/lib/nova-launch/solana";
import type { ConnectedAccount } from "@/lib/nova-launch/types";

// Deliberately read-only: no provider object, signing method or credential crosses this boundary.
export type UserWallet = {
  address: string;
  chain: "solana";
  provider: "privy";
  access: readonly ["read", "propose"];
};
export type SynqIdentity = { id: string; email?: string; wallet: UserWallet | null };
export type PrivyAccount = {
  type: string;
  chain_type?: string;
  wallet_client_type?: string;
  connector_type?: string;
  address?: string;
  wallet_index?: number;
  imported?: boolean;
};

export function embeddedWallet(
  accounts: readonly PrivyAccount[],
  pinned?: string | null,
): string | null {
  const wallets = accounts.filter(
    (a) =>
      a.type === "wallet" &&
      a.chain_type === "solana" &&
      a.wallet_client_type === "privy" &&
      a.imported !== true,
  );
  if (pinned) {
    if (!wallets.some((a) => a.address === pinned)) throw new Error("wallet_identity_changed");
    return solanaAddress(pinned);
  }
  if (!wallets.length) return null;
  const primary = wallets.filter((a) => a.wallet_index === 0);
  const candidates = primary.length ? primary : wallets;
  if (candidates.length !== 1 || !candidates[0].address)
    throw new Error("ambiguous_embedded_wallet");
  return solanaAddress(candidates[0].address);
}

export function novaWalletContext(
  owned: UserWallet | null,
  input: unknown,
): ConnectedAccount | null {
  if (input == null)
    return owned
      ? { chain: "solana", address: owned.address, kind: "wallet", access: ["read", "propose"] }
      : null;
  if (typeof input !== "object" || !("address" in input) || !("kind" in input))
    throw new Error("invalid_wallet_context");
  const address = solanaAddress(input.address);
  if (input.kind === "wallet") {
    if (!owned || owned.address !== address) throw new Error("wallet_not_owned");
    return { chain: "solana", address, kind: "wallet", access: ["read", "propose"] };
  }
  if (input.kind !== "watch") throw new Error("invalid_wallet_context");
  return { chain: "solana", address, kind: "watch", access: ["read"] };
}
