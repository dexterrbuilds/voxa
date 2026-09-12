import { createHash, randomUUID } from "node:crypto";
import { simulationAdapter } from "@/lib/nova-launch/actions";
import type { ActionPlan } from "@/lib/nova-launch/types";
import type { Action, Quote } from "@/lib/nova-launch/types";
import { validateQuoteAction } from "./chain/quotes";

// jsonb does not preserve object key order. Hash the same canonical representation
// before storage and after loading, while preserving array order and scalar values.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function createPlan(conversationId: string, input: unknown): ActionPlan {
  const action = simulationAdapter.validate(input);
  const quote = simulationAdapter.quote(action);
  return sealPlan(conversationId, action, quote);
}
export function createQuotePlan(conversationId: string, input: unknown, quote: Quote): ActionPlan {
  const action = validateQuoteAction(input);
  if (quote.mode !== "quote_only") throw new Error("A live quote is required.");
  return sealPlan(conversationId, action, quote);
}
function sealPlan(conversationId: string, action: Action, quote: Quote): ActionPlan {
  const id = randomUUID();
  const hash = createHash("sha256")
    .update(canonical({ id, conversationId, action, quote }))
    .digest("hex");
  return {
    id,
    conversationId,
    action,
    quote,
    hash,
    approvalToken: randomUUID(),
    status: "pending",
  };
}
export function verifyPlan(plan: ActionPlan) {
  const hash = createHash("sha256")
    .update(
      canonical({
        id: plan.id,
        conversationId: plan.conversationId,
        action: plan.action,
        quote: plan.quote,
      }),
    )
    .digest("hex");
  if (hash !== plan.hash) throw new Error("Plan changed. A new approval is required.");
  if (plan.quote.mode === "quote_only") validateQuoteAction(plan.action);
  else simulationAdapter.validate(plan.action);
}
