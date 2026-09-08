import { after, NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, jsonError } from "@/lib/server/agents/registration";
import {
  externalAgentsInRoomsEnabled,
  isExternalAgentInRoom,
  isHumanRoomMember,
  validateRoomTextAgent,
} from "@/lib/server/agents/room-access";
import { getServiceRoleClient } from "@/lib/server/supabase-service";
import { roomTextRuntime } from "@/lib/server/agents/runtime/RoomTextRuntime";
import {
  loadExternalAgentThread,
  recordExternalAgentExchange,
} from "@/lib/server/agents/room-memory";
import { hasPermission, resolveEffectivePermissions } from "@/lib/agents/permissions";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { recordAgentAnalytics } from "@/lib/server/agents/analytics";
import { agentRequestId, runAgentRequest } from "@/lib/server/agents/runtime/requests";
import { buildAgentContext } from "@/lib/server/agents/runtime/context";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;
// Per-user room-text budget (separate bucket from the sandbox limiter).
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// POST /api/agents/room/message  { roomId, agentId, message }
//
// EXPERIMENTAL, text-only. Sends ONE user message to the caller's OWN approved +
// verified external agent that is present in the room, and returns the text reply.
// Re-validates flag + ownership + approval + verification + endpoint + room
// membership on EVERY call. Sends NO room audio and NO transcript — only the one
// message string. Never dispatches to LiveKit.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!externalAgentsInRoomsEnabled()) {
    return jsonError("External agents in rooms are not enabled.", 403, "feature_disabled");
  }

  const limit = checkRateLimit(`room-text:${auth.user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many messages. Try again in ${limit.retryAfterSeconds}s.`,
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  const { roomId, agentId, message } = (body ?? {}) as {
    roomId?: unknown;
    agentId?: unknown;
    message?: unknown;
  };
  if (typeof roomId !== "string" || !roomId.trim()) {
    return jsonError("A roomId is required.", 400, "invalid_room_id");
  }
  if (typeof agentId !== "string" || !agentId.trim()) {
    return jsonError("An agentId is required.", 400, "invalid_agent_id");
  }
  if (typeof message !== "string" || !message.trim()) {
    return jsonError("A non-empty message is required.", 400, "invalid_message");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError("Message is too long.", 400, "message_too_long");
  }

  // Ownership + approval + verification + endpoint.
  const validation = await validateRoomTextAgent(auth.supabase, auth.user.id, agentId.trim());
  if (!validation.ok) {
    return jsonError(validation.message, validation.status, validation.code);
  }

  const service = getServiceRoleClient();
  if (!service) {
    return jsonError(
      "Room agent messaging is not configured (missing service role).",
      500,
      "service_not_configured",
    );
  }

  // Caller must be in the room, and the agent must actually be in the room.
  const [isMember, agentPresent] = await Promise.all([
    isHumanRoomMember(service, roomId.trim(), auth.user.id),
    isExternalAgentInRoom(service, roomId.trim(), validation.agent.id),
  ]);
  if (!isMember) {
    return jsonError("You must be in the room to message an agent.", 403, "not_room_member");
  }
  if (!agentPresent) {
    return jsonError("This agent is not in the room.", 409, "agent_not_in_room");
  }

  // Permission enforcement (server-side, never trusts the client). Effective
  // permissions = registered ∩ grantable; future audio/transcript permissions are
  // always dropped and never effective.
  const permissions = resolveEffectivePermissions(validation.agent.permissions);

  // room_text_reply is required to reply to room messages at all.
  if (!hasPermission(permissions, "room_text_reply")) {
    return jsonError(
      "This agent is not permitted to reply to room messages.",
      403,
      "permission_denied",
    );
  }

  // memory_read_thread gates loading prior context. If not granted, send no
  // history (omit the capability, do not error). Never a room transcript.
  const canReadThread = hasPermission(permissions, "memory_read_thread");
  const requestId = agentRequestId(request.headers.get("X-Voxa-Request-Id"));
  try {
    const result = await runAgentRequest(
      `room:${auth.user.id}:${roomId.trim()}:${validation.agent.id}`,
      requestId,
      async () => {
        const history = canReadThread
          ? await loadExternalAgentThread(service, roomId.trim(), validation.agent.id)
          : [];

        // Text-only: send the message string + room/agent ids + the scoped thread history.
        const text = message.trim();
        const reply = await roomTextRuntime.sendMessageToAgent({
          endpointUrl: validation.agent.endpoint_url!,
          message: text,
          requestId,
          signal: request.signal,
          context: buildAgentContext({
            roomId: roomId.trim(),
            agentId: validation.agent.id,
            history,
            allowMemory: canReadThread,
          }),
        });

        if (!reply.ok) {
          // Endpoint failed: surface the error, DO NOT persist (thread stays intact).
          return {
            status:
              reply.code === "agent_timeout" ? 504 : reply.code === "agent_cancelled" ? 408 : 502,
            body: { error: reply.detail, code: reply.code, requestId },
          };
        }

        // memory_write_thread gates persistence. If not granted, do not persist.
        if (hasPermission(permissions, "memory_write_thread")) {
          await recordExternalAgentExchange(service, {
            roomId: roomId.trim(),
            agentId: validation.agent.id,
            userText: text,
            replyText: reply.text,
          });
        }

        after(() =>
          recordAgentAnalytics(auth.supabase, {
            agentId: validation.agent.id,
            metric: "room_messages_sent",
            ownerUserId: auth.user.id,
          }),
        );

        // tools_visualize gates returning tools. Capability enforcement: tools whose
        // name is not in the agent's registered capabilities are marked untrusted
        // (kept for display, never trusted) rather than silently accepted.
        const registeredCapabilities = new Set(validation.agent.capabilities ?? []);
        const tools = hasPermission(permissions, "tools_visualize")
          ? (reply.tools ?? []).map((tool) => ({
              ...tool,
              untrusted: !registeredCapabilities.has(tool.name),
            }))
          : [];

        return {
          status: 200,
          body: {
            requestId,
            reply: { text: reply.text, streaming: false, tools },
            agent: { id: validation.agent.id, name: validation.agent.name },
            permissions,
          },
        };
      },
    );
    if (!result.ok)
      return jsonError("This agent is already responding. Try again shortly.", 409, "agent_busy");
    return NextResponse.json(result.value.body, { status: result.value.status });
  } catch {
    return jsonError(
      "Agent request could not finish. Please try again.",
      503,
      "agent_request_failed",
    );
  }
}
