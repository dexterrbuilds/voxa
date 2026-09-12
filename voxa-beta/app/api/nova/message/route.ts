import { NextRequest, NextResponse } from "next/server";
import { launchAccess, storageError, uuid } from "@/lib/server/nova-launch/access";
import { understandIntent, actionSchemas, boundedContext } from "@/lib/nova-launch/actions";
import { createPlan, verifyPlan } from "@/lib/server/nova-launch/plans";
import { getNovaModelProvider } from "@/lib/server/nova-launch/model";
import type { ActionPlan, NovaBlock } from "@/lib/nova-launch/types";
import { handleChainRequest, solanaEnabled } from "@/lib/server/nova-launch/chain/service";
import { ChainError } from "@/lib/server/nova-launch/chain/transport";
import { readContext } from "@/lib/server/nova-launch/chain/intent";
import { SolanaInputError } from "@/lib/nova-launch/solana";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !uuid.test(body.conversationId) ||
    !uuid.test(body.requestId) ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > 4000
  )
    return NextResponse.json({ error: "Enter a message of 1–4,000 characters." }, { status: 400 });
  const args = {
    p_owner: a.user.id,
    p_conversation: body.conversationId,
    p_request: body.requestId,
  };
  let requote: ActionPlan | undefined;
  if (solanaEnabled()) {
    try {
      readContext(body.account);
    } catch {
      return NextResponse.json({ error: "Enter a valid public Solana address." }, { status: 400 });
    }
    if (body.requotePlanId !== undefined) {
      if (!uuid.test(body.requotePlanId))
        return NextResponse.json({ error: "Invalid quote." }, { status: 400 });
      const prior = await a.db
        .from("nova_action_plans")
        .select("plan")
        .eq("id", body.requotePlanId)
        .eq("owner_id", a.user.id)
        .eq("conversation_id", body.conversationId)
        .maybeSingle();
      if (prior.error) return storageError();
      if (!prior.data || prior.data.plan.quote.mode !== "quote_only")
        return NextResponse.json(
          { error: "Quote unavailable in this conversation." },
          { status: 404 },
        );
      try {
        verifyPlan(prior.data.plan);
      } catch {
        return NextResponse.json({ error: "Quote changed. Request a new quote." }, { status: 409 });
      }
      requote = prior.data.plan;
    }
  }
  const { error } = await a.db.rpc("nova_launch_turn", {
    ...args,
    p_operation: "start",
    p_text: body.text,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          "This conversation is unavailable, or this request was already received. Reload history before retrying.",
      },
      { status: 409 },
    );
  const history = await a.db
    .from("nova_messages")
    .select("role,text")
    .eq("owner_id", a.user.id)
    .eq("conversation_id", body.conversationId)
    .neq("request_id", body.requestId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (history.error) return storageError();
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(50000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };
      try {
        emit({ type: "state", state: "thinking" });
        const recent = history.data.reverse();
        const chain = solanaEnabled()
          ? await handleChainRequest({
              prompt: body.text,
              owner: a.user.id,
              conversationId: body.conversationId,
              account: body.account,
              history: recent,
              signal,
              model: getNovaModelProvider,
              requote,
            })
          : null;
        const intent = chain ? null : understandIntent(body.text);
        let text = "";
        const blocks: NovaBlock[] = [];
        let plan: ActionPlan | null = null;
        if (chain) {
          text = chain.text;
          plan = chain.plan;
          blocks.push(...chain.blocks);
          emit({ type: "text", delta: text });
        } else if (intent && "action" in intent) {
          plan = createPlan(body.conversationId, intent.action);
          text =
            "Here is a simulation plan. Review the exact parameters below. This does not use a live quote or move funds.";
          blocks.push({ type: "action_plan", plan });
          emit({ type: "text", delta: text });
        } else if (intent && "clarification" in intent) {
          text = solanaEnabled()
            ? "I can read public Solana accounts and quote swaps. Please specify an address or an exact swap amount and both tokens. Positions remain simulated; transfers and execution are disabled."
            : intent.clarification;
          emit({ type: "text", delta: text });
        } else {
          for await (const event of getNovaModelProvider().stream({
            context: boundedContext(recent),
            prompt: body.text,
            signal,
            actionSchemas,
          })) {
            signal.throwIfAborted();
            // Model output is prose only in v1. Proposals are never auto-executed.
            if (event.type === "text") {
              text += event.delta;
              if (text.length > 12000) throw new Error("Response too long.");
              emit(event);
            }
          }
        }
        signal.throwIfAborted();
        if (!text.trim()) throw new Error("Empty response.");
        const saved = await a.db.rpc("nova_launch_turn", {
          ...args,
          p_operation: "finish",
          p_text: text,
          p_blocks: blocks,
          p_plan: plan,
        });
        if (saved.error) throw new Error("Response not saved.");
        emit({ type: "complete", blocks });
      } catch (error) {
        if (solanaEnabled())
          console.warn("nova_chain_request", {
            requestId: body.requestId,
            status: "failed",
            code:
              error instanceof ChainError
                ? error.code
                : error instanceof SolanaInputError
                  ? "invalid_input"
                  : "unavailable",
          });
        emit({
          type: "error",
          error:
            error instanceof ChainError || error instanceof SolanaInputError
              ? error.message
              : "Nova couldn't finish this reply. Please try again. No transaction was executed.",
        });
        await a.db.rpc("nova_launch_turn", { ...args, p_operation: "cancel" });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
      void a.db.rpc("nova_launch_turn", { ...args, p_operation: "cancel" });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
export async function DELETE(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const body = await request.json().catch(() => null);
  if (!body || !uuid.test(body.conversationId) || !uuid.test(body.requestId))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { error } = await a.db.rpc("nova_launch_turn", {
    p_owner: a.user.id,
    p_conversation: body.conversationId,
    p_request: body.requestId,
    p_operation: "cancel",
  });
  return error ? storageError() : NextResponse.json({ ok: true });
}
