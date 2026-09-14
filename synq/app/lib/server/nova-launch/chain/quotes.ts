import {
  atomicAmount,
  displayAmount,
  solanaAddress,
  SOL_MINT,
  USDC_MINT,
  type LiveQuote,
  type ResolvedSwapParams,
} from "@/lib/nova-launch/solana";
import type { Action, ActionAdapter, ActionPlan, ExecutionResult } from "@/lib/nova-launch/types";
import { ChainError, object, units, readJson, safeLabel } from "./transport";
import type { SolanaDataProvider } from "./solana";

export const DEFAULT_SLIPPAGE_BPS = 50;
export const MAX_SLIPPAGE_BPS = 100;
export const SOL_RESERVE = 5000000n; // Planning buffer only, not an estimate of execution fees.
export function slippage(value: unknown = DEFAULT_SLIPPAGE_BPS): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > MAX_SLIPPAGE_BPS)
    throw new ChainError("slippage", "Slippage must be between 0.01% and 1%. The default is 0.5%.");
  return value as number;
}
export function validateQuoteAction(
  input: unknown,
): Action & { type: "swap"; params: ResolvedSwapParams } {
  const a = object(input),
    p = object(a.params);
  if (
    Object.keys(a).some((k) => !["type", "params"].includes(k)) ||
    a.type !== "swap" ||
    p.chain !== "solana" ||
    Object.keys(p).some(
      (k) =>
        ![
          "chain",
          "input",
          "output",
          "amount",
          "inputMint",
          "outputMint",
          "inputDecimals",
          "outputDecimals",
          "slippageBps",
          "observedAddress",
          "observedBalance",
          "observedAt",
        ].includes(k),
    )
  )
    throw new ChainError("invalid_action", "Unsupported swap parameters.");
  for (const side of ["input", "output"] as const) {
    const mint = solanaAddress(p[`${side}Mint`]),
      decimals = p[`${side}Decimals`];
    const expected = mint === SOL_MINT ? "SOL" : mint === USDC_MINT ? "USDC" : mint;
    if (
      p[side] !== expected ||
      !Number.isInteger(decimals) ||
      Number(decimals) < 0 ||
      Number(decimals) > 18 ||
      (mint === SOL_MINT && decimals !== 9) ||
      (mint === USDC_MINT && decimals !== 6)
    )
      throw new ChainError(
        "mint_mismatch",
        "Token identity or decimals do not match the resolved mint.",
      );
  }
  if (p.inputMint === p.outputMint || typeof p.amount !== "string")
    throw new ChainError("invalid_action", "Choose two different tokens and a valid amount.");
  atomicAmount(p.amount, Number(p.inputDecimals));
  slippage(p.slippageBps);
  if (p.observedAddress !== undefined) {
    solanaAddress(p.observedAddress);
    units(p.observedBalance);
    if (typeof p.observedAt !== "string" || !Number.isFinite(Date.parse(p.observedAt)))
      throw new ChainError("invalid_action", "Balance observation is invalid.");
  } else if (p.observedAt !== undefined || p.observedBalance !== undefined)
    throw new ChainError("invalid_action", "Balance context is incomplete.");
  return structuredClone(input) as Action & { type: "swap"; params: ResolvedSwapParams };
}
export interface SwapQuoteProvider {
  quote(params: ResolvedSwapParams, signal: AbortSignal): Promise<LiveQuote>;
}
export class JupiterQuoteProvider implements SwapQuoteProvider {
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
    private allowPublicDevelopmentAccess = false,
  ) {}
  async quote(params: ResolvedSwapParams, signal: AbortSignal): Promise<LiveQuote> {
    const action = validateQuoteAction({ type: "swap", params }),
      p = action.params;
    if (!this.key && !(this.allowPublicDevelopmentAccess && process.env.NODE_ENV !== "production"))
      throw new ChainError(
        "quote_not_configured",
        "Live swap quotes are not configured yet. No simulated quote was substituted.",
      );
    const inputAtomic = atomicAmount(p.amount, p.inputDecimals).toString();
    // No taker, payer, receiver, transaction builder, signing or submission endpoint.
    const url = new URL("https://api.jup.ag/swap/v2/order");
    url.search = new URLSearchParams({
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      amount: inputAtomic,
      slippageBps: String(p.slippageBps),
      swapMode: "ExactIn",
    }).toString();
    const response = object(
      await readJson(
        url.href,
        { headers: this.key ? { "x-api-key": this.key } : {} },
        signal,
        "jupiter",
        "quote",
        this.fetcher,
      ),
    );
    if (
      response.error ||
      response.errorCode ||
      response.transaction ||
      response.taker ||
      response.inputMint !== p.inputMint ||
      response.outputMint !== p.outputMint ||
      response.inAmount !== inputAtomic ||
      response.swapMode !== "ExactIn" ||
      response.slippageBps !== p.slippageBps
    )
      throw new ChainError(
        "quote_mismatch",
        "The quote did not match the requested tokens, amount or slippage. Try again.",
      );
    const outputAtomic = units(response.outAmount),
      minimumAtomic = units(response.otherAmountThreshold);
    if (
      BigInt(outputAtomic) <= 0n ||
      BigInt(minimumAtomic) <= 0n ||
      BigInt(minimumAtomic) > BigInt(outputAtomic) ||
      BigInt(minimumAtomic) < (BigInt(outputAtomic) * BigInt(10000 - p.slippageBps)) / 10000n
    )
      throw new ChainError(
        "quote_mismatch",
        "The quote's minimum output is inconsistent with its slippage.",
      );
    const now = Date.now(),
      providerExpiry =
        typeof response.expireAt === "string" ? Date.parse(response.expireAt) : now + 30000;
    const expiry = Math.min(now + 30000, providerExpiry);
    if (!Number.isFinite(expiry) || expiry <= now)
      throw new ChainError("expired", "This quote has expired. Request a fresh quote.");
    const impact =
      typeof response.priceImpact === "number" && Number.isFinite(response.priceImpact)
        ? response.priceImpact
        : null;
    const route = Array.isArray(response.routePlan)
      ? response.routePlan
          .slice(0, 12)
          .map((r) => safeLabel(object(object(r).swapInfo).label, 40))
          .filter((s): s is string => Boolean(s))
      : [];
    return {
      mode: "quote_only",
      source: "Jupiter V2",
      description: "Real swap quote; execution disabled",
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(expiry).toISOString(),
      inputAtomic,
      outputAtomic,
      minimumAtomic,
      expectedOutput: displayAmount(outputAtomic, p.outputDecimals),
      minimumOutput: displayAmount(minimumAtomic, p.outputDecimals),
      priceImpactPct: impact,
      slippageBps: p.slippageBps,
      route,
      feeBps:
        Number.isInteger(response.feeBps) &&
        Number(response.feeBps) >= 0 &&
        Number(response.feeBps) <= 10000
          ? Number(response.feeBps)
          : null,
      assumptions: [
        "Quote only. No transaction was built or submitted.",
        "Network fees, rent and execution feasibility have not been simulated.",
        ...(p.observedAddress
          ? ["Balance was checked at the displayed observation time; it can change."]
          : ["No wallet balance was checked."]),
      ],
    };
  }
}
export class SolanaSwapAdapter implements ActionAdapter {
  id = "solana-quote-v1";
  constructor(private quotes: SwapQuoteProvider) {}
  supports(action: Action) {
    return action.type === "swap";
  }
  validate = validateQuoteAction;
  async quote(action: Action, signal = new AbortController().signal) {
    return this.quotes.quote(this.validate(action).params, signal);
  }
  async simulate(plan: ActionPlan, signal: AbortSignal): Promise<ExecutionResult> {
    signal.throwIfAborted();
    this.validate(plan.action);
    if (plan.quote.mode !== "quote_only" || Date.parse(plan.quote.expiresAt) <= Date.now())
      throw new ChainError("expired", "This quote has expired. Refresh it before continuing.");
    return {
      mode: "quote_only",
      planId: plan.id,
      message: "Quote approved — execution is not enabled yet. No funds moved.",
      transactionSignature: null,
    };
  }
  async execute(): Promise<ExecutionResult> {
    throw new ChainError(
      "execution_disabled",
      "Execution is disabled. No transaction can be signed or submitted.",
    );
  }
}
export function getSwapAdapter() {
  return new SolanaSwapAdapter(
    new JupiterQuoteProvider(process.env.JUPITER_API_KEY || "", fetch, true),
  );
}
export async function resolveToken(value: string, data: SolanaDataProvider, signal: AbortSignal) {
  const known =
    value === SOL_MINT || value.toUpperCase() === "SOL" || value.toLowerCase() === "solana"
      ? { mint: SOL_MINT, symbol: "SOL", decimals: 9 }
      : value === USDC_MINT || value.toUpperCase() === "USDC"
        ? { mint: USDC_MINT, symbol: "USDC", decimals: 6 }
        : null;
  if (known) return known;
  try {
    solanaAddress(value);
  } catch {
    throw new ChainError(
      "ambiguous_token",
      "Token symbols can refer to different mints. Paste the exact mint you mean; only SOL and USDC have canonical symbol mappings.",
    );
  }
  const token = await data.token(value, signal);
  // Unknown symbols are never promoted into identity, even if metadata claims SOL/USDC.
  return { mint: token.mint, symbol: token.mint, decimals: token.decimals };
}
