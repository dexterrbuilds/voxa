import {
  validBase58,
  solanaAddress,
  solanaSignature,
  atomicAmount,
} from "@/lib/nova-launch/solana";
import { ChainError, object } from "./transport";

export type ChainIntent =
  | { kind: "portfolio" | "activity" | "last_transaction"; address?: string }
  | { kind: "token"; address?: string }
  | { kind: "transaction"; signature?: string }
  | {
      kind: "swap";
      input: string;
      output: string;
      amount?: string;
      percent?: number;
      slippageBps?: number;
    };
export function readContext(value: unknown): { address: string; kind: "watch" | "wallet" } | null {
  if (value === null || value === undefined) return null;
  const input = object(value);
  return {
    address: solanaAddress(input.address),
    kind: input.kind === "wallet" ? "wallet" : "watch",
  };
}
export function reference(text: string, bytes: number): string | undefined {
  return text.split(/[^1-9A-HJ-NP-Za-km-z]+/).find((word) => validBase58(word, bytes));
}
export function parseChainIntent(prompt: string): ChainIntent | null {
  const text = prompt.trim(),
    address = reference(text, 32),
    signature = reference(text, 64);
  if (
    /^(?:quote\s+)?(?:swap|swapping|exchange)\b/i.test(text) ||
    /what (?:would|will|do) i get for/i.test(text)
  ) {
    const cleaned = text.replace(/[.!?]$/, "");
    const slip = /\s+(?:with|at)\s+(\d+(?:\.\d+)?)%\s+slippage$/i.exec(cleaned);
    const core = slip ? cleaned.slice(0, slip.index) : cleaned;
    const swap =
      /^(?:quote\s+)?(?:swap|swapping|exchange)\s+(half|\d+(?:\.\d+)?%?)\s+(?:of\s+)?(?:my\s+)?(\S+)\s+(?:to|for|into)\s+(\S+)$/i.exec(
        core,
      );
    const worth =
      /^what (?:would|will|do) i get for\s+(\d+(?:\.\d+)?)\s+(\S+)\s+worth of\s+(\S+)$/i.exec(core);
    const match = swap || worth;
    if (!match)
      throw new ChainError(
        "clarify_swap",
        "Specify the input amount and both tokens, for example: Swap 1 SOL to USDC. For other tokens, use exact mint addresses.",
      );
    const quantity = match[1];
    return {
      kind: "swap",
      input: match[2],
      output: match[3],
      ...(quantity.toLowerCase() === "half"
        ? { percent: 50 }
        : quantity.endsWith("%")
          ? { percent: Number(quantity.slice(0, -1)) }
          : { amount: quantity }),
      ...(slip ? { slippageBps: Number(atomicAmount(slip[1], 2)) } : {}),
    };
  }
  if (/\b(last|latest)\s+transaction\b/i.test(text)) return { kind: "last_transaction", address };
  if (/\b(recent|activity|did this wallet)\b/i.test(text)) return { kind: "activity", address };
  if (/\b(what.*(?:own|have)|show my tokens|portfolio|balances?|how much.*SOL)\b/i.test(text))
    return { kind: "portfolio", address };
  if (
    /\b(token|mint)\b/i.test(text) &&
    !/\b(explain|what is a|how do)\s+(?:a\s+)?token\b/i.test(text)
  )
    return { kind: "token", address };
  if (signature || /\b(this transaction|explain this|transaction signature)\b/i.test(text))
    return { kind: "transaction", signature };
  if (address) return { kind: "portfolio", address };
  return null;
}
// Model routing is advisory. Every non-canonical identifier and quantity must occur
// in this user's prompt; provider metadata never participates in intent extraction.
export function validateModelIntent(value: unknown, prompt: string): ChainIntent | null {
  const raw = object(value);
  if (raw.kind === "conversation") return null;
  if (
    !["portfolio", "activity", "last_transaction", "token", "transaction", "swap"].includes(
      String(raw.kind),
    )
  )
    throw new ChainError(
      "unsupported",
      "That operation is not supported. No transaction was prepared.",
    );
  if (raw.kind === "swap") {
    const appears = (value: unknown) =>
      typeof value === "string" &&
      (validBase58(value, 32)
        ? prompt.split(/[^1-9A-HJ-NP-Za-km-z]+/).includes(value)
        : prompt.split(/[^a-zA-Z0-9]+/).some((word) => word.toLowerCase() === value.toLowerCase()));
    if (
      typeof raw.input !== "string" ||
      typeof raw.output !== "string" ||
      !appears(raw.input) ||
      !appears(raw.output)
    )
      throw new ChainError(
        "clarify_token",
        "Please specify both token symbols or exact mint addresses.",
      );
    let percent: number | undefined, amount: string | undefined;
    if (
      typeof raw.percent === "number" &&
      ((raw.percent === 50 && /\bhalf\b/i.test(prompt)) || prompt.includes(`${raw.percent}%`))
    )
      percent = raw.percent;
    else if (typeof raw.amount === "string" && prompt.split(/\s+/).includes(raw.amount))
      amount = raw.amount;
    else
      throw new ChainError(
        "clarify_amount",
        "Please specify an exact decimal amount or percentage.",
      );
    // Slippage is interpreted only from explicit syntax, never model discretion.
    const specified = /(\d+(?:\.\d+)?)%\s+slippage/i.exec(prompt);
    return {
      kind: "swap",
      input: raw.input,
      output: raw.output,
      amount,
      percent,
      ...(specified ? { slippageBps: Number(atomicAmount(specified[1], 2)) } : {}),
    };
  }
  if (raw.address !== undefined && raw.address !== null && raw.address !== "") {
    const address = solanaAddress(raw.address);
    if (!prompt.includes(address))
      throw new ChainError("invented_address", "Paste the address you want to inspect.");
  }
  if (raw.signature !== undefined && raw.signature !== null && raw.signature !== "") {
    const signature = solanaSignature(raw.signature);
    if (!prompt.includes(signature))
      throw new ChainError(
        "invented_signature",
        "Paste the transaction signature you want to inspect.",
      );
  }
  return {
    kind: raw.kind,
    ...(raw.address ? { address: String(raw.address) } : {}),
    ...(raw.signature ? { signature: String(raw.signature) } : {}),
  } as ChainIntent;
}
