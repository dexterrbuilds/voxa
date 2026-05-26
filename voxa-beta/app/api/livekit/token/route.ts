import { createClient } from "@supabase/supabase-js";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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
    return jsonError("Voice is not configured yet.", 500);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Authentication is not configured yet.", 500);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return jsonError("Sign in before joining voice.", 401);
  }

  let body: { roomId?: unknown };
  try {
    body = (await request.json()) as { roomId?: unknown };
  } catch {
    return jsonError("Invalid voice token request.", 400);
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
    return jsonError("Room voice is not available yet.", 500);
  }

  if (!roomResult.data) {
    return jsonError("Room not found.", 404);
  }

  if (roomResult.data.status === "ended") {
    return jsonError("This room has ended.", 409);
  }

  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  const name =
    metadata.full_name ||
    metadata.name ||
    email.split("@")[0]?.replace(/[._-]/g, " ") ||
    "Voxa User";

  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name,
    metadata: JSON.stringify({ email }),
    ttl: "1h",
  });

  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
  });
}
