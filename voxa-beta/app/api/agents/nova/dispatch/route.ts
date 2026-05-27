import { createClient } from "@supabase/supabase-js";
import { AgentDispatchClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const novaAgentName = process.env.LIVEKIT_NOVA_AGENT_NAME ?? "nova";
const roomIdPattern = /^[a-zA-Z0-9_-]{6,80}$/;

function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonError("Nova dispatch is not configured yet.", 500);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Authentication is not configured yet.", 500);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return jsonError("Sign in before inviting Nova.", 401);
  }

  let body: { roomId?: unknown };
  try {
    body = (await request.json()) as { roomId?: unknown };
  } catch {
    return jsonError("Invalid Nova dispatch request.", 400);
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomIdPattern.test(roomId)) {
    return jsonError("Invalid room id.", 400);
  }

  const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Your session expired. Sign in again.", 401);
  }

  const roomResult = await supabase
    .from("rooms")
    .select("room_id, status")
    .eq("room_id", roomId)
    .maybeSingle();

  if (roomResult.error) {
    return jsonError("Nova could not access this room.", 500);
  }

  if (!roomResult.data) {
    return jsonError("Room not found.", 404);
  }

  if (roomResult.data.status === "ended") {
    return jsonError("This room has ended.", 409);
  }

  const participantResult = await supabase
    .from("room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .eq("participant_type", "human")
    .limit(1);

  if (participantResult.error) {
    return jsonError("Nova could not verify room access.", 500);
  }

  if ((participantResult.data?.length ?? 0) === 0) {
    return jsonError("Join this room before inviting Nova.", 403);
  }

  const metadata = JSON.stringify({
    agent_id: "nova",
    requested_by: user.id,
    room_id: roomId,
    source: "voxa",
  });

  try {
    const dispatchClient = new AgentDispatchClient(livekitUrl, livekitApiKey, livekitApiSecret);
    const existingDispatches = await dispatchClient.listDispatch(roomId);
    const existingNovaDispatch = existingDispatches.find(
      (dispatch) => dispatch.agentName === novaAgentName,
    );

    if (existingNovaDispatch) {
      return NextResponse.json({
        agentName: novaAgentName,
        dispatchId: existingNovaDispatch.id,
        status: "already-dispatched",
      });
    }

    const dispatch = await dispatchClient.createDispatch(roomId, novaAgentName, { metadata });

    return NextResponse.json({
      agentName: novaAgentName,
      dispatchId: dispatch.id,
      status: "dispatched",
    });
  } catch (error) {
    console.error("Nova LiveKit dispatch failed.", error);
    return jsonError("Nova could not join voice yet.", 502);
  }
}
