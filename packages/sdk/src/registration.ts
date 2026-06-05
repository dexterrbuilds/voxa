import type { AgentRegistration, AgentRegistrationInput } from "./types";

export function defineAgentRegistration(input: AgentRegistrationInput): AgentRegistrationInput {
  return input;
}

export async function registerAgent(
  _input: AgentRegistrationInput,
): Promise<AgentRegistration> {
  throw new Error(
    "External agent registration is not available yet. Use defineAgentRegistration() for typed metadata previews.",
  );
}
