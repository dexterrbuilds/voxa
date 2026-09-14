// Deprecated observer aliases only; canonical metadata is primary.
export function agentParticipantAttributes(agentId: string) {
  return {
    "synq.agent_id": agentId,
    "synq.participant_type": "agent",
    "voxa.agent_id": agentId,
    "voxa.participant_type": "agent",
  };
}
