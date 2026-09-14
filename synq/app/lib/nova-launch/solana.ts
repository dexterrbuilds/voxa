import bs58 from "bs58";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export class SolanaInputError extends Error {}
export function validBase58(value: unknown, bytes: number): boolean {
  if (typeof value !== "string" || value.length > 90) return false;
  try {
    const decoded = bs58.decode(value);
    return decoded.length === bytes && bs58.encode(decoded) === value;
  } catch {
    return false;
  }
}
export function solanaAddress(value: unknown): string {
  if (typeof value !== "string" || !validBase58(value, 32))
    throw new SolanaInputError("Enter a valid Solana address, never a private key or seed phrase.");
  return value;
}
export function solanaSignature(value: unknown): string {
  if (typeof value !== "string" || !validBase58(value, 64))
    throw new SolanaInputError("Enter a valid Solana transaction signature.");
  return value;
}
export function atomicAmount(value: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/.test(value)
  )
    throw new SolanaInputError("Enter a positive decimal amount without exponents.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new SolanaInputError("That amount has more precision than this token supports.");
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units <= 0n || units > 18446744073709551615n)
    throw new SolanaInputError("Amount is outside the supported range.");
  return units;
}
export function displayAmount(units: string | bigint, decimals: number): string {
  const raw = BigInt(units),
    sign = raw < 0n ? "-" : "",
    digits = (raw < 0n ? -raw : raw).toString().padStart(decimals + 1, "0");
  if (!decimals) return sign + digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return sign + digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
export type TokenInfo = {
  mint: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  supply: string;
  metadataSource: "canonical" | "on-chain-untrusted" | "unavailable";
  program: string;
};
export type Holding = {
  mint: string;
  amount: string;
  atomic: string;
  decimals: number;
  symbol: string | null;
  name: string | null;
};
export type Portfolio = {
  address: string;
  sol: string;
  lamports: string;
  slot: number;
  observedAt: string;
  tokens: Holding[];
  tokenAccounts: number;
  partial: boolean;
};
export type Activity = {
  signature: string;
  slot: number;
  time: string | null;
  status: "success" | "failed" | "unknown";
};
export type TransactionFacts = Activity & {
  feeSol: string;
  signers: string[];
  programs: string[];
  instructions: string[];
  solChanges: { address: string; change: string }[];
  tokenChanges: { mint: string; owner: string | null; account: string; change: string }[];
  partial: boolean;
};
export type ChainBlock =
  | { type: "portfolio"; data: Portfolio }
  | { type: "token"; data: TokenInfo; observedAt: string }
  | { type: "transaction"; data: TransactionFacts }
  | { type: "activity"; address: string; items: Activity[]; observedAt: string };
export type ResolvedSwapParams = {
  chain: "solana";
  input: string;
  output: string;
  amount: string;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number;
  observedAddress?: string;
  observedBalance?: string;
  observedAt?: string;
};
export type LiveQuote = {
  mode: "quote_only";
  description: string;
  assumptions: string[];
  expiresAt: string;
  source: "Jupiter V2";
  acquiredAt: string;
  inputAtomic: string;
  outputAtomic: string;
  minimumAtomic: string;
  expectedOutput: string;
  minimumOutput: string;
  priceImpactPct: number | null;
  slippageBps: number;
  route: string[];
  feeBps: number | null;
};
