import { NextRequest, NextResponse } from "next/server";
import { launchAccess, storageError, uuid } from "@/lib/server/nova-launch/access";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const id = request.nextUrl.searchParams.get("id");
  if (id && !uuid.test(id))
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  if (!id) {
    const { data, error } = await a.db
      .from("nova_conversations")
      .select("id,title,updated_at")
      .eq("owner_id", a.user.id)
      .order("updated_at", { ascending: false })
      .limit(100);
    return error ? storageError() : NextResponse.json({ conversations: data });
  }
  const { data: conversation, error } = await a.db
    .from("nova_conversations")
    .select("id,title,updated_at")
    .eq("owner_id", a.user.id)
    .eq("id", id)
    .maybeSingle();
  if (error) return storageError();
  if (!conversation)
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const [messages, plans] = await Promise.all([
    a.db
      .from("nova_messages")
      .select("id,role,text,blocks,created_at")
      .eq("owner_id", a.user.id)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    a.db
      .from("nova_action_plans")
      .select("id,status,result")
      .eq("owner_id", a.user.id)
      .eq("conversation_id", id),
  ]);
  if (messages.error || plans.error) return storageError();
  return NextResponse.json({ conversation, messages: messages.data.reverse(), plans: plans.data });
}
export async function POST(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.db
    .from("nova_conversations")
    .insert({ owner_id: a.user.id })
    .select("id,title,updated_at")
    .single();
  return error ? storageError() : NextResponse.json({ conversation: data });
}
export async function PATCH(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !uuid.test(body.id) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 80
  )
    return NextResponse.json({ error: "Choose a title of 1–80 characters." }, { status: 400 });
  const { data, error } = await a.db
    .from("nova_conversations")
    .update({ title: body.title.trim() })
    .eq("id", body.id)
    .eq("owner_id", a.user.id)
    .select("id")
    .maybeSingle();
  return error ? storageError() : NextResponse.json({ ok: !!data });
}
