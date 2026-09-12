import type { Action, ActionAdapter, ActionPlan, Intent, Turn } from "./types";

export const actionSchemas = [
  "swap",
  "perp_open",
  "perp_close",
  "perp_modify",
  "transfer",
  "portfolio_read",
  "position_read",
  "token_read",
  "wallet_read",
  "transaction_read",
] as const;
function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unsupported action parameters.");
}
function amount(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max)
    throw new Error("Enter a positive amount within simulation limits.");
}
// Only two structured actions are launch-capable. Other schema types are future contracts.
export function validateAction(input: unknown): Action {
  if (!input || typeof input !== "object") throw new Error("Invalid action.");
  const a = input as Record<string, unknown>;
  exactKeys(a, ["type", "params"]);
  if (!a.params || typeof a.params !== "object" || Array.isArray(a.params))
    throw new Error("Invalid parameters.");
  const p = a.params as Record<string, unknown>;
  if (a.type === "swap") {
    exactKeys(p, ["chain", "input", "output", "amount"]);
    if (
      p.chain !== "solana" ||
      !["SOL", "USDC"].includes(String(p.input)) ||
      !["SOL", "USDC"].includes(String(p.output)) ||
      p.input === p.output
    )
      throw new Error("Only SOL/USDC swap simulations are available.");
    amount(p.amount, 1000000);
  } else if (a.type === "perp_open") {
    exactKeys(p, ["venue", "market", "side", "collateral", "leverage", "stopLoss", "takeProfit"]);
    if (
      p.venue !== "simulation" ||
      p.market !== "SOL" ||
      !["long", "short"].includes(String(p.side))
    )
      throw new Error("Only simulated SOL positions are supported. No venue is connected.");
    amount(p.collateral, 1000000);
    amount(p.leverage, 20);
    if (Number(p.leverage) < 1) throw new Error("Leverage must be between 1x and 20x.");
    for (const field of ["stopLoss", "takeProfit"])
      if (p[field] !== undefined) amount(p[field], 1000000);
  } else throw new Error("That action is not supported yet. No transaction was prepared.");
  return structuredClone(input) as Action;
}

export function understandIntent(prompt: string): Intent {
  const swap = /^swap\s+(\d+(?:\.\d+)?)\s+(SOL|USDC)\s+(?:to|for)\s+(SOL|USDC)[.!]?$/i.exec(
    prompt.trim(),
  );
  if (swap)
    return {
      action: validateAction({
        type: "swap",
        params: {
          chain: "solana",
          amount: Number(swap[1]),
          input: swap[2].toUpperCase(),
          output: swap[3].toUpperCase(),
        },
      }),
    };
  const leadingLeverage =
    /^open\s+(?:a\s+)?(\d+(?:\.\d+)?)x\s+SOL\s+(long|short)\s+with\s+(\d+(?:\.\d+)?)\s+USDC[.!]?$/i.exec(
      prompt.trim(),
    );
  const perp = leadingLeverage
    ? [leadingLeverage[0], leadingLeverage[2], leadingLeverage[3], leadingLeverage[1]]
    : /^open\s+(?:a\s+)?SOL\s+(long|short)\s+(?:with\s+)?(\d+(?:\.\d+)?)\s+USDC\s+at\s+(\d+(?:\.\d+)?)x[.!]?$/i.exec(
        prompt.trim(),
      );
  if (perp)
    return {
      action: validateAction({
        type: "perp_open",
        params: {
          venue: "simulation",
          market: "SOL",
          side: perp[1].toLowerCase(),
          collateral: Number(perp[2]),
          leverage: Number(perp[3]),
        },
      }),
    };
  if (
    /\b(swap|long|short|transfer|send .*SOL|positions?|balance|portfolio|wallet|transaction|token address)\b/i.test(
      prompt,
    )
  )
    return {
      clarification:
        "I can explain on-chain concepts and simulate SOL/USDC swaps or SOL positions. No balances, market quotes, or transactions are live. For a simulation, try ‘Swap 1 SOL to USDC’ or ‘Open SOL long with 200 USDC at 3x’. Paste an address for discussion, but I cannot verify its activity yet.",
    };
  return { conversation: true };
}

export function boundedContext(turns: Pick<Turn, "role" | "text">[]) {
  let remaining = 12000;
  return turns
    .slice(-12)
    .reverse()
    .flatMap((turn) => {
      if (remaining <= 0 || !["user", "nova"].includes(turn.role)) return [];
      const text = turn.text.slice(0, Math.min(2000, remaining));
      remaining -= text.length;
      return [{ role: turn.role, text }];
    })
    .reverse();
}

export const simulationAdapter = {
  id: "simulation-v1",
  supports: (action: Action) => action.type === "swap" || action.type === "perp_open",
  validate: validateAction,
  quote(action: Action): import("./types").Quote {
    validateAction(action);
    return {
      mode: "simulation",
      description:
        action.type === "swap" ? "Dry run of a swap request" : "Dry run of a position request",
      assumptions: [
        "No live price, liquidity, fee or liquidation estimate.",
        "No wallet signature, funds movement or on-chain transaction.",
      ],
      expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
    };
  },
  async simulate(
    plan: ActionPlan,
    signal: AbortSignal,
  ): Promise<import("./types").ExecutionResult> {
    signal.throwIfAborted();
    validateAction(plan.action);
    if (Date.parse(plan.quote.expiresAt) <= Date.now())
      throw new Error("This plan expired. Request a new simulation.");
    return {
      mode: "simulation",
      planId: plan.id,
      message: "Simulation completed. No funds moved and no transaction was submitted.",
      transactionSignature: null,
    };
  },
  async execute() {
    throw new Error(
      "Real execution is disabled. A wallet connection never grants transaction permission.",
    );
  },
} satisfies ActionAdapter;
