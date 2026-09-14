import {
  atomicAmount,
  displayAmount,
  solanaAddress,
  SOL_MINT,
  type ResolvedSwapParams,
} from "@/lib/nova-launch/solana";
import type { ActionPlan, NovaBlock, NovaModelProvider, Turn } from "@/lib/nova-launch/types";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createQuotePlan } from "../plans";
import { getSolanaProvider, type SolanaDataProvider } from "./solana";
import {
  getSwapAdapter,
  resolveToken,
  slippage,
  SOL_RESERVE,
  type SolanaSwapAdapter,
} from "./quotes";
import { ChainError } from "./transport";
import {
  parseChainIntent,
  readContext,
  reference,
  validateModelIntent,
  type ChainIntent,
} from "./intent";

export function solanaEnabled() {
  return process.env.NOVA_SOLANA_ENABLED === "true";
}
export type ChainReply = { text: string; blocks: NovaBlock[]; plan: ActionPlan | null };
export async function handleChainRequest(
  input: {
    prompt: string;
    owner: string;
    conversationId: string;
    account?: unknown;
    history: Pick<Turn, "role" | "text">[];
    signal: AbortSignal;
    model: () => NovaModelProvider;
    requote?: ActionPlan;
  },
  data?: SolanaDataProvider,
  adapter: SolanaSwapAdapter = getSwapAdapter(),
): Promise<ChainReply | null> {
  const { prompt, signal } = input,
    account = readContext(input.account);
  let intent: ChainIntent | null = null;
  if (input.requote) {
    const params = adapter.validate(input.requote.action).params;
    intent = {
      kind: "swap",
      input: params.inputMint,
      output: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps,
    };
  } else {
    intent = parseChainIntent(prompt);
    if (!intent && !/^(?:open|transfer|send)\b/i.test(prompt)) {
      const model = input.model();
      if (model.extractIntent)
        intent = validateModelIntent(await model.extractIntent(prompt, signal), prompt);
    }
  }
  if (!intent) return null;
  data ??= getSolanaProvider();
  const limit = intent.kind === "swap" ? 12 : 30;
  if (!checkRateLimit(`nova-chain:${input.owner}:${intent.kind}`, limit, 60000).allowed)
    throw new ChainError("rate_limit", "Please wait a moment before requesting more chain data.");
  const previousText = input.history
    .filter((t) => t.role === "user")
    .slice(-4)
    .reverse()
    .map((t) => t.text);
  const historicalAddress = previousText.map((text) => reference(text, 32)).find(Boolean);
  const address =
    "address" in intent && intent.address ? intent.address : account?.address || historicalAddress;
  const requireAddress = () => {
    if (!address)
      throw new ChainError(
        "missing_address",
        "Connect a wallet or add the public Solana address you want to inspect.",
      );
    return solanaAddress(address);
  };
  if (intent.kind === "portfolio") {
    const portfolio = await data.portfolio(requireAddress(), signal);
    return {
      text: `Observed ${portfolio.sol} SOL and ${portfolio.tokens.length} non-zero token holdings. These are public-chain balances, not proof of wallet ownership. No fiat valuation is assumed.${portfolio.partial ? " This is a partial view of the first 200 token accounts." : ""}`,
      blocks: [{ type: "portfolio", data: portfolio }],
      plan: null,
    };
  }
  if (intent.kind === "token") {
    const token = await data.token(requireAddress(), signal);
    return {
      text: "Here are the mint's observed on-chain facts. Names and symbols are metadata, not a safety rating or proof of legitimacy.",
      blocks: [{ type: "token", data: token, observedAt: new Date().toISOString() }],
      plan: null,
    };
  }
  if (intent.kind === "activity") {
    const owner = requireAddress(),
      items = await data.recent(owner, signal);
    return {
      text: items.length
        ? "These are the latest 10 or fewer signatures involving this address, not its complete history. An involved address need not be the initiator."
        : "No recent transactions were returned for this address.",
      blocks: [{ type: "activity", address: owner, items, observedAt: new Date().toISOString() }],
      plan: null,
    };
  }
  if (intent.kind === "transaction" || intent.kind === "last_transaction") {
    let signature =
      intent.kind === "transaction"
        ? intent.signature || previousText.map((text) => reference(text, 64)).find(Boolean)
        : (await data.recent(requireAddress(), signal))[0]?.signature;
    if (!signature)
      throw new ChainError(
        "missing_signature",
        "Paste the transaction signature, or add a wallet and ask for its last transaction.",
      );
    const transaction = await data.transaction(signature, signal);
    signature = transaction.signature;
    // Deterministic explanation avoids treating memos/token names as model instructions.
    const text = `Observed facts: this transaction ${transaction.status === "success" ? "succeeded" : transaction.status === "failed" ? "failed" : "has an unknown result"}, with a ${transaction.feeSol} SOL fee. ${transaction.signers.length} signer(s) and ${transaction.programs.length} program(s) are shown. ${transaction.status === "failed" ? "Failed instructions do not establish completed transfers. " : ""}Interpretation: balance changes show the net effect, including fees and rent; they do not by themselves identify a swap or its purpose. Unidentified instructions are not guessed.`;
    let explanation = "";
    try {
      // Only normalized facts cross this boundary; no raw logs, memos or token metadata.
      explanation =
        (await input
          .model()
          .explainTransaction?.(
            transaction,
            AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          )) || "";
    } catch {
      signal.throwIfAborted();
      console.info("nova_chain_explanation", { status: "facts_only_fallback" });
    }
    return {
      text: explanation ? `${text}\n\nNova's interpretation: ${explanation.slice(0, 2000)}` : text,
      blocks: [{ type: "transaction", data: transaction }],
      plan: null,
    };
  }
  if (intent.kind !== "swap") return null;
  const swap = intent;
  const [from, to] = await Promise.all([
    resolveToken(swap.input, data, signal),
    resolveToken(swap.output, data, signal),
  ]);
  if (from.mint === to.mint) throw new ChainError("same_token", "Choose two different tokens.");
  const observedAddress =
    input.requote &&
    input.requote.action.type === "swap" &&
    "observedAddress" in input.requote.action.params
      ? input.requote.action.params.observedAddress
      : account?.address || historicalAddress;
  let balance: string | undefined, observedAt: string | undefined;
  if (observedAddress) {
    const portfolio = await data.portfolio(observedAddress, signal);
    if (portfolio.partial && from.mint !== SOL_MINT)
      throw new ChainError(
        "partial_balance",
        "This portfolio is too large for a complete token balance check.",
      );
    balance =
      from.mint === SOL_MINT
        ? portfolio.lamports
        : portfolio.tokens.find((t) => t.mint === from.mint)?.atomic || "0";
    observedAt = portfolio.observedAt;
  }
  let raw: bigint;
  if (swap.percent !== undefined) {
    if (balance === undefined)
      throw new ChainError(
        "missing_balance",
        "Add a read-only wallet address before quoting a percentage of its balance.",
      );
    if (!Number.isFinite(swap.percent) || swap.percent <= 0 || swap.percent > 100)
      throw new ChainError(
        "invalid_percent",
        "Enter a percentage greater than 0 and no more than 100, with at most two decimal places.",
      );
    const available = BigInt(balance) - (from.mint === SOL_MINT ? SOL_RESERVE : 0n);
    raw = (BigInt(balance) * atomicAmount(String(swap.percent), 2)) / 10000n;
    if (raw > available) raw = available;
  } else raw = atomicAmount(swap.amount || "", from.decimals);
  if (raw <= 0n)
    throw new ChainError(
      "insufficient_balance",
      "There is not enough available balance for that amount.",
    );
  if (balance !== undefined && raw + (from.mint === SOL_MINT ? SOL_RESERVE : 0n) > BigInt(balance))
    throw new ChainError(
      "insufficient_balance",
      `You don't have enough ${from.symbol === from.mint ? "of this token" : from.symbol} for that amount${from.mint === SOL_MINT ? " after a 0.005 SOL planning reserve" : ""}.`,
    );
  const params: ResolvedSwapParams = {
    chain: "solana",
    input: from.symbol,
    output: to.symbol,
    inputMint: from.mint,
    outputMint: to.mint,
    inputDecimals: from.decimals,
    outputDecimals: to.decimals,
    amount: displayAmount(raw, from.decimals),
    slippageBps: slippage(swap.slippageBps),
    ...(observedAddress ? { observedAddress, observedBalance: balance, observedAt } : {}),
  };
  const action = adapter.validate({ type: "swap", params });
  const quote = await adapter.quote(action, signal);
  signal.throwIfAborted();
  const plan = createQuotePlan(input.conversationId, action, quote);
  return {
    text: "Here is a fresh quote from Jupiter. Review the tokens, amounts and slippage. Approving only records your review; execution is not enabled.",
    blocks: [{ type: "action_plan", plan }],
    plan,
  };
}
