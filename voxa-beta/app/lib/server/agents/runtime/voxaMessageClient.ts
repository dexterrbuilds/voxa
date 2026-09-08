import type {
  AgentRuntimeMessageContext,
  AgentRuntimeReply,
  AgentRuntimeTool,
  AgentRuntimeToolStatus,
} from "@/lib/server/agents/runtime/types";
import { randomUUID } from "node:crypto";
import { requestAgentJson } from "./endpoint";
import { logAgentEvent } from "./events";

// Shared transport for the `voxa.message` wire contract. Both SandboxRuntime and
// RoomTextRuntime use this; they only differ in the context they force (sandbox
// vs. room_text). It NEVER sends room audio or transcripts — only the single
// message string the caller passes.

export const VOXA_MESSAGE_TYPE = "voxa.message";
export const VOXA_VOICE_TYPE = "voxa.voice";
export const DEFAULT_MESSAGE_TIMEOUT_MS = 8000;

const TOOL_STATUSES: AgentRuntimeToolStatus[] = ["pending", "running", "completed", "failed"];

// Agents register their verified handshake URL. Derive the sibling message URL
// from it so the same registration covers both probes.
export function deriveMessageEndpoint(endpointUrl: string): string {
  const url = new URL(endpointUrl);
  url.pathname = url.pathname.replace(/\/handshake\/?$/, "/message");
  return url.toString();
}

// Defensively parse the optional `tools` array. Drops malformed entries; caps the
// list so a hostile endpoint cannot flood the UI.
export function parseTools(value: unknown): AgentRuntimeTool[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tools: AgentRuntimeTool[] = [];
  for (const entry of value.slice(0, 16)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const name = (entry as { name?: unknown }).name;
    const status = (entry as { status?: unknown }).status;
    if (typeof name !== "string" || !name.trim()) {
      continue;
    }
    const safeStatus =
      typeof status === "string" && TOOL_STATUSES.includes(status as AgentRuntimeToolStatus)
        ? (status as AgentRuntimeToolStatus)
        : "completed";
    const detail = (entry as { detail?: unknown }).detail;
    tools.push({
      name: name.trim().slice(0, 64),
      status: safeStatus,
      detail: typeof detail === "string" ? detail.slice(0, 240) : undefined,
    });
  }
  return tools.length > 0 ? tools : undefined;
}

export async function postVoxaMessage(input: {
  signal?: AbortSignal;
  requestId?: string;
  endpointUrl: string;
  message: string;
  context: AgentRuntimeMessageContext;
  timeoutMs?: number;
  // Wire `type` to send. Defaults to "voxa.message"; VoiceAgentRuntime passes
  // "voxa.voice". The reply shape is the same (`{ text }` required).
  type?: string;
}): Promise<AgentRuntimeReply> {
  const requestId = input.requestId ?? randomUUID();
  const log = (event: string, details: Parameters<typeof logAgentEvent>[1]) =>
    logAgentEvent(event, {
      ...details,
      agentId:
        typeof input.context.agentId === "string" ? input.context.agentId.slice(0, 80) : undefined,
      mode:
        input.context.sandbox === true
          ? "sandbox"
          : input.context.mode === "room_text"
            ? "room_text"
            : input.context.mode === "voice_beta"
              ? "voice_beta"
              : undefined,
    });
  const started = performance.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) controller.abort();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_MESSAGE_TIMEOUT_MS,
  );

  try {
    log("agent_request_started", { requestId });
    const response = await requestAgentJson({
      url: deriveMessageEndpoint(input.endpointUrl),
      requestId,
      body: {
        type: input.type ?? VOXA_MESSAGE_TYPE,
        message: input.message,
        context: input.context,
        requestId,
      },
      signal: controller.signal,
    });

    log("agent_connected", {
      requestId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    if (response.status < 200 || response.status >= 300) {
      log("agent_error", {
        requestId,
        status: response.status,
        code: "agent_bad_response",
      });
      return {
        ok: false,
        code: "agent_bad_response",
        detail: `Agent endpoint responded with HTTP ${response.status}.`,
      };
    }

    const payload = response.payload as {
      text?: unknown;
      streaming?: unknown;
      tools?: unknown;
    } | null;
    if (
      !payload ||
      typeof payload.text !== "string" ||
      !payload.text.trim() ||
      payload.text.length > 32000
    ) {
      log("agent_error", { requestId, code: "agent_bad_response" });
      return {
        ok: false,
        code: "agent_bad_response",
        detail: "Agent endpoint did not return a JSON `{ text }` reply.",
      };
    }

    log("agent_first_response", {
      requestId,
      durationMs: Math.round(performance.now() - started),
    });
    log("agent_response_complete", {
      requestId,
      durationMs: Math.round(performance.now() - started),
    });
    return {
      ok: true,
      text: payload.text,
      streaming: payload.streaming === true,
      tools: parseTools(payload.tools),
      raw: payload,
    };
  } catch {
    const code = input.signal?.aborted
      ? "agent_cancelled"
      : controller.signal.aborted
        ? "agent_timeout"
        : "agent_unreachable";
    log(code === "agent_timeout" ? "agent_timeout" : "agent_error", {
      requestId,
      code,
      durationMs: Math.round(performance.now() - started),
    });
    return {
      ok: false,
      code,
      detail:
        code === "agent_cancelled"
          ? "Request cancelled."
          : code === "agent_timeout"
            ? "The agent took too long. Try again."
            : "Could not reach the agent. Check its public endpoint and try again.",
    };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
  }
}
