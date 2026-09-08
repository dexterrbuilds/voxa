import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase } from "@/lib/server/agents/registration";
import {
  externalAgentsInRoomsEnabled,
  externalAgentVoiceEnabled,
  getOwnRoomEligibleExternalAgents,
} from "@/lib/server/agents/room-access";

export const runtime = "nodejs";

// GET /api/agents/room-eligible
//
// Returns the caller's OWN approved + verified external agents for EXPERIMENTAL,
// DISPLAY-ONLY visibility in the live-room Agent Selector. Gated behind the
// server-only EXPERIMENTAL_EXTERNAL_AGENTS_IN_ROOMS flag (default false).
//
// When the flag is off (the default), this returns `{ enabled: false, agents: [] }`
// and the room behaves exactly as before. Even when on, these agents are never
// dispatched, never called from a room, and never speak — invite stays disabled.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!externalAgentsInRoomsEnabled()) {
    return NextResponse.json({ enabled: false, voiceEnabled: false, agents: [] });
  }

  const agents = await getOwnRoomEligibleExternalAgents(auth.supabase, auth.user.id);
  return NextResponse.json({ enabled: true, voiceEnabled: externalAgentVoiceEnabled(), agents });
}
