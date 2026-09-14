export * from "@synq/sdk";
import { createAgentHandshake as canonicalHandshake } from "@synq/sdk";
export declare function createAgentHandshake(input: Parameters<typeof canonicalHandshake>[0]):
  Omit<ReturnType<typeof canonicalHandshake>, "protocol"> & { protocol: "voxa-agent" };
