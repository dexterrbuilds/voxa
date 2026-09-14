// Accept legacy wire values, but emit the canonical protocol for canonical requests.
export const legacyProtocol = "voxa-agent";
export function canonicalAgentPath(path: string) {
  return path.replace(/^\/voxa\//, "/synq/");
}
export function protocolForPath(path: string) {
  return canonicalAgentPath(path) === path ? "synq-agent" : legacyProtocol;
}
export function canonicalMessageType(type: string | undefined) {
  return type === "voxa.handshake"
    ? "synq.handshake"
    : type === "voxa.message"
      ? "synq.message"
      : type === "voxa.voice"
        ? "synq.voice"
        : type;
}
