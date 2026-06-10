import type {
  AgentRuntimeMessageContext,
  AgentRuntimeReply,
  AgentRuntimeTool,
  AgentRuntimeToolStatus,
} from "@/lib/server/agents/runtime/types";

// Shared transport for the `voxa.message` wire contract. Both SandboxRuntime and
// RoomTextRuntime use this; they only differ in the context they force (sandbox
// vs. room_text). It NEVER sends room audio or transcripts — only the single
// message string the caller passes.

export const VOXA_MESSAGE_TYPE = "voxa.message";
export const DEFAULT_MESSAGE_TIMEOUT_MS = 8000;

const TOOL_STATUSES: AgentRuntimeToolStatus[] = ["pending", "running", "completed", "failed"];

// Agents register their verified handshake URL. Derive the sibling message URL
// from it so the same registration covers both probes.
export function deriveMessageEndpoint(endpointUrl: string): string {
  if (endpointUrl.endsWith("/voxa/handshake")) {
    return `${endpointUrl.slice(0, -"/voxa/handshake".length)}/voxa/message`;
  }
  if (endpointUrl.endsWith("/handshake")) {
    return `${endpointUrl.slice(0, -"/handshake".length)}/message`;
  }
  return endpointUrl;
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
  endpointUrl: string;
  message: string;
  context: AgentRuntimeMessageContext;
  timeoutMs?: number;
}): Promise<AgentRuntimeReply> {
  const messageUrl = deriveMessageEndpoint(input.endpointUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_MESSAGE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(messageUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        type: VOXA_MESSAGE_TYPE,
        message: input.message,
        context: input.context,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "agent_bad_response",
        detail: `Agent endpoint responded with HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { text?: unknown; streaming?: unknown; tools?: unknown }
      | null;
    if (!payload || typeof payload.text !== "string") {
      return {
        ok: false,
        code: "agent_bad_response",
        detail: "Agent endpoint did not return a JSON `{ text }` reply.",
      };
    }

    return {
      ok: true,
      text: payload.text,
      streaming: payload.streaming === true,
      tools: parseTools(payload.tools),
      raw: payload,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError" ? "timed out" : "was unreachable";
    return { ok: false, code: "agent_unreachable", detail: `Agent endpoint ${reason}.` };
  } finally {
    clearTimeout(timeout);
  }
}
