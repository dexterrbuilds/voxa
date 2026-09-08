export type ContextTurn = { role: "user" | "agent"; text: string };

export function boundAgentHistory(
  history: readonly ContextTurn[],
  maxTurns = 12,
  maxChars = 12000,
): ContextTurn[] {
  let remaining = maxChars;
  const result: ContextTurn[] = [];
  for (const turn of history.slice(-maxTurns).reverse()) {
    if (remaining <= 0) break;
    if (!["user", "agent"].includes(turn.role) || typeof turn.text !== "string") continue;
    const text = turn.text.trim().slice(0, Math.min(4000, remaining));
    if (!text) continue;
    remaining -= text.length;
    result.push({ role: turn.role, text });
  }
  return result.reverse();
}

// Explicit whitelist: do not spread room objects, profiles, auth data or transcripts.
export function buildAgentContext(input: {
  agentId: string;
  roomId?: string;
  history?: readonly ContextTurn[];
  allowMemory: boolean;
}) {
  return {
    agentId: input.agentId,
    ...(input.roomId ? { roomId: input.roomId } : {}),
    ...(input.allowMemory ? { history: boundAgentHistory(input.history ?? []) } : {}),
  };
}
