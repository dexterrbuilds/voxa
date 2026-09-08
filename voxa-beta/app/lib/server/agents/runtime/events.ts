export function logAgentEvent(
  event: string,
  input: {
    requestId?: string;
    agentId?: string;
    mode?: string;
    durationMs?: number;
    status?: number;
    code?: string;
  },
) {
  console.info(JSON.stringify({ event, ...input }));
}
