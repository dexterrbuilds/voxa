import { NextRequest, NextResponse } from "next/server";
import { launchAccess, storageError, uuid } from "@/lib/server/nova-launch/access";
import { understandIntent, actionSchemas, boundedContext } from "@/lib/nova-launch/actions";
import { createPlan } from "@/lib/server/nova-launch/plans";
import { getNovaModelProvider } from "@/lib/server/nova-launch/model";
import type { NovaBlock } from "@/lib/nova-launch/types";
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
        const intent = understandIntent(body.text);
        let text = "";
        const blocks: NovaBlock[] = [];
        let plan = null;
        if ("action" in intent) {
          plan = createPlan(body.conversationId, intent.action);
          text =
            "Here is a simulation plan. Review the exact parameters below. This does not use a live quote or move funds.";
          blocks.push({ type: "action_plan", plan });
          emit({ type: "text", delta: text });
        } else if ("clarification" in intent) {
          text = intent.clarification;
          emit({ type: "text", delta: text });
        } else {
          for await (const event of getNovaModelProvider().stream({
            context: boundedContext(history.data.reverse()),
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
      } catch {
        emit({
          type: "error",
          error: "Nova couldn't finish this reply. Please try again. No transaction was executed.",
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
