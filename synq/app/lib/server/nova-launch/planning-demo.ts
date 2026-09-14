import { createCapabilityPlan } from "./planner";
import { getCapabilityRegistry } from "./capabilities";

// Public example identifiers, not recipient ownership or an executable distribution.
const recipients = [
  "11111111111111111111111111111111",
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
];
export const planningDemoPrompt = "Show the DEXTER planning demo";
export function dexterPlanningDemo(ownerId: string, conversationId: string) {
  return createCapabilityPlan(
    ownerId,
    conversationId,
    {
      objective:
        "Launch DEXTER, buy 2 SOL worth, distribute 5% total equally to three example addresses, and lock 20% for six months.",
      steps: [
        {
          id: "launch",
          capabilityId: "token.launch",
          provider: "clawpump",
          inputs: { symbol: "DEXTER", venue: "pump.fun" },
          dependencies: [],
        },
        {
          id: "buy",
          capabilityId: "token.buy",
          provider: "clawpump",
          inputs: { mint: { stepId: "launch", artifact: "mint" }, amountSol: "2" },
          dependencies: ["launch"],
        },
        {
          id: "balance",
          capabilityId: "portfolio.verify",
          provider: "synq",
          inputs: { mint: { stepId: "buy", artifact: "mint" } },
          dependencies: ["buy"],
        },
        {
          id: "distribute",
          capabilityId: "token.distribute",
          provider: "solana",
          inputs: { mint: { stepId: "balance", artifact: "mint" }, totalPercent: 5, recipients },
          dependencies: ["balance"],
        },
        {
          id: "lock",
          capabilityId: "token.lock",
          provider: "streamflow",
          inputs: {
            mint: { stepId: "distribute", artifact: "mint" },
            percent: 20,
            durationMonths: 6,
          },
          dependencies: ["distribute"],
        },
        {
          id: "verify",
          capabilityId: "state.verify",
          provider: "synq",
          inputs: { mint: { stepId: "lock", artifact: "mint" } },
          dependencies: ["lock"],
        },
        {
          id: "report",
          capabilityId: "report",
          provider: "synq",
          inputs: { mint: { stepId: "verify", artifact: "mint" } },
          dependencies: ["verify"],
        },
      ],
    },
    getCapabilityRegistry(),
    true,
  );
}
