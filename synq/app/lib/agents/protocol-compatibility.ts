// Deprecated wire compatibility. New registrations should use /synq/handshake.
const legacyProtocol = "voxa-agent";
const legacyHeader = "X-Voxa-Request-Id";
export function isSupportedAgentProtocol(protocol: unknown) {
  return protocol === "synq-agent" || protocol === legacyProtocol;
}
export function agentWireType(endpoint: string, type: string) {
  // Existing registrations keep their old wire dialect; never retry a message in another dialect.
  return new URL(endpoint).pathname.startsWith("/synq/") ? type : type.replace(/^synq\./, "voxa.");
}
export function requestIdFromHeaders(headers: Headers) {
  return headers.get("X-Synq-Request-Id") ?? headers.get(legacyHeader);
}
export function agentRequestHeaders(endpoint: string, requestId: string) {
  return {
    "X-Synq-Request-Id": requestId,
    ...(!new URL(endpoint).pathname.startsWith("/synq/") ? { [legacyHeader]: requestId } : {}),
  };
}
