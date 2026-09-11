import { NextRequest, NextResponse } from "next/server";
import { launchAccess, uuid } from "@/lib/server/nova-launch/access";
import { transcribeWithDeepgram } from "@/lib/server/nova/providers/stt/deepgram";
import { synthesizeNovaSpeech } from "@/lib/server/nova/providers/tts";
export const runtime = "nodejs";
export const maxDuration = 60;
// Reuse Path A providers, not its room-specific transport or participant identity.
export async function POST(request: NextRequest) {
  const a = await launchAccess(request);
  if (a instanceof NextResponse) return a;
  try {
    const form = await request.formData();
    const id = String(form.get("conversationId") || "");
    if (!uuid.test(id)) throw new Error("Invalid conversation.");
    const { data, error } = await a.db
      .from("nova_conversations")
      .select("id")
      .eq("id", id)
      .eq("owner_id", a.user.id)
      .maybeSingle();
    if (error || !data)
      return NextResponse.json({ error: "Conversation unavailable." }, { status: 404 });
    request.signal.throwIfAborted();
    const audio = form.get("audio");
    if (audio instanceof Blob) {
      if (
        audio.size === 0 ||
        audio.size > 3 * 1024 * 1024 ||
        !/^audio\/(webm|mp4|ogg|wav)/.test(audio.type)
      )
        return NextResponse.json(
          { error: "Record a short audio prompt (under 3 MB)." },
          { status: 400 },
        );
      const text = await transcribeWithDeepgram(audio);
      request.signal.throwIfAborted();
      return NextResponse.json({ text });
    }
    const messageId = String(form.get("messageId") || "");
    if (!uuid.test(messageId)) throw new Error("Missing reply.");
    const message = await a.db
      .from("nova_messages")
      .select("text")
      .eq("id", messageId)
      .eq("conversation_id", id)
      .eq("owner_id", a.user.id)
      .eq("role", "nova")
      .maybeSingle();
    if (!message.data || message.error) throw new Error("Missing reply.");
    const speech = await synthesizeNovaSpeech(message.data.text.slice(0, 6000));
    request.signal.throwIfAborted();
    if (!speech) throw new Error("No voice provider.");
    return new Response(new Uint8Array(speech.audio), {
      headers: { "Content-Type": speech.contentType, "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Voice is unavailable right now. Your text conversation still works." },
      { status: 503 },
    );
  }
}
