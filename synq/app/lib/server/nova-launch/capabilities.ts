import { solanaAddress, solanaSignature, atomicAmount } from "@/lib/nova-launch/solana";
import type {
  Capability,
  CapabilityProvider,
  FieldSchema,
  RecordSchema,
  RiskLevel,
} from "@/lib/nova-launch/capability-types";

export class CapabilityError extends Error {}
const providers: readonly CapabilityProvider[] = [
  { id: "solana", name: "Solana RPC", implemented: true, mode: "read_only" },
  { id: "jupiter", name: "Jupiter", implemented: true, mode: "quote_only" },
  ...[
    ["clawpump", "ClawPump / Pump.fun"],
    ["streamflow", "Streamflow"],
    ["kamino", "Kamino"],
    ["meteora", "Meteora"],
    ["phoenix", "Phoenix"],
    ["synq", "Synq verification"],
  ].map(([id, name]) => ({ id, name, implemented: false, mode: "planned" as const })),
];
const address: FieldSchema = { type: "address" };
const decimal: FieldSchema = { type: "decimal" };
const text: FieldSchema = { type: "text" };
const percent: FieldSchema = { type: "percent" };
type Definition = [string, string, string, string, RiskLevel, RecordSchema, RecordSchema, boolean?];
const definitions: Definition[] = [
  [
    "portfolio.read",
    "Read portfolio",
    "Observed native and SPL balances",
    "solana",
    "READ",
    { address },
    { address, balance: decimal },
    true,
  ],
  [
    "transaction.inspect",
    "Inspect transaction",
    "Bounded deterministic transaction facts",
    "solana",
    "READ",
    { signature: { type: "signature" } },
    { signature: { type: "signature" }, status: text },
    true,
  ],
  [
    "activity.read",
    "Read recent activity",
    "At most ten recent signatures",
    "solana",
    "READ",
    { address },
    { address },
    true,
  ],
  [
    "token.inspect",
    "Inspect token",
    "Observed mint facts, not a safety rating",
    "solana",
    "READ",
    { mint: address },
    { mint: address, supply: decimal },
    true,
  ],
  [
    "swap.quote",
    "Quote swap",
    "Existing Jupiter quote-only adapter",
    "jupiter",
    "QUOTE",
    { inputMint: address, outputMint: address, amount: decimal },
    { inputMint: address, outputMint: address, amount: decimal },
    true,
  ],
  [
    "swap.execute",
    "Execute swap",
    "Future explicit wallet-authorized swap",
    "jupiter",
    "ASSET_TRANSFER",
    { inputMint: address, outputMint: address, amount: decimal },
    { signature: { type: "signature" } },
  ],
  [
    "transfer.execute",
    "Transfer assets",
    "Future explicit transfer",
    "solana",
    "ASSET_TRANSFER",
    { recipient: address, mint: address, amount: decimal },
    { signature: { type: "signature" } },
  ],
  [
    "token.launch",
    "Launch token",
    "Future provider integration, not implemented",
    "clawpump",
    "TOKEN_LAUNCH",
    { symbol: text, venue: { type: "text", values: ["pump.fun"] } },
    { mint: address, signature: { type: "signature" }, venue: text },
  ],
  [
    "token.buy",
    "Buy token",
    "Future acquisition using an observed mint",
    "clawpump",
    "ASSET_TRANSFER",
    { mint: address, amountSol: decimal },
    { mint: address, signature: { type: "signature" } },
  ],
  [
    "token.distribute",
    "Distribute tokens",
    "Future distribution of a total percentage, split equally",
    "solana",
    "ASSET_TRANSFER",
    { mint: address, totalPercent: percent, recipients: { type: "addresses" } },
    { mint: address },
  ],
  [
    "token.airdrop",
    "Airdrop tokens",
    "Future explicit distribution",
    "solana",
    "ASSET_TRANSFER",
    { mint: address, amount: decimal, recipients: { type: "addresses" } },
    { mint: address },
  ],
  [
    "token.lock",
    "Lock tokens",
    "Future lock with explicit duration",
    "streamflow",
    "ASSET_TRANSFER",
    { mint: address, percent, durationMonths: { type: "integer" } },
    { mint: address, signature: { type: "signature" } },
  ],
  [
    "perp.open",
    "Open position",
    "Future leveraged position",
    "phoenix",
    "LEVERAGED_POSITION",
    { market: text, collateral: decimal, leverage: { type: "integer" } },
    { position: text },
  ],
  [
    "perp.close",
    "Close position",
    "Future position close",
    "phoenix",
    "LEVERAGED_POSITION",
    { position: text },
    { signature: { type: "signature" } },
  ],
  [
    "lend.deposit",
    "Deposit lending assets",
    "Future lending integration",
    "kamino",
    "ASSET_TRANSFER",
    { mint: address, amount: decimal },
    { position: text },
  ],
  [
    "lend.withdraw",
    "Withdraw lending assets",
    "Future lending withdrawal",
    "kamino",
    "ASSET_TRANSFER",
    { position: text, amount: decimal },
    { signature: { type: "signature" } },
  ],
  [
    "portfolio.verify",
    "Verify purchased balance",
    "Future evidence check after purchase",
    "synq",
    "READ",
    { mint: address },
    { mint: address, balance: decimal },
  ],
  [
    "state.verify",
    "Verify final balances and lock",
    "Future cross-provider evidence check",
    "synq",
    "READ",
    { mint: address },
    { mint: address },
  ],
  [
    "report",
    "Report observed results",
    "Future facts-only result report",
    "synq",
    "READ",
    { mint: address },
    { summary: text },
  ],
];
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Registration is server-owned and closed after construction. Model/request data never registers providers.
export class CapabilityRegistry {
  private readonly entries = new Map<string, Capability>();
  constructor(chainEnabled: boolean) {
    for (const [
      id,
      name,
      description,
      provider,
      riskLevel,
      inputSchema,
      outputSchema,
      implemented,
    ] of definitions) {
      const stateChanging = riskLevel !== "READ" && riskLevel !== "QUOTE";
      this.entries.set(
        id,
        freeze({
          id,
          name,
          description,
          category: id.split(".")[0],
          providers: [provider],
          inputSchema,
          outputSchema,
          riskLevel,
          readOnly: !stateChanging,
          stateChanging,
          requiresApproval: riskLevel !== "READ",
          requiresWalletSignature: stateChanging,
          enabled: !!implemented && chainEnabled,
        }),
      );
    }
  }
  list() {
    return [...this.entries.values()];
  }
  provider(id: string) {
    const provider = providers.find((p) => p.id === id);
    if (!provider) throw new CapabilityError("Unknown capability provider.");
    return freeze({ ...provider });
  }
  resolve(id: string, providerId: string, preview = false) {
    const capability = this.entries.get(id);
    if (!capability || !capability.providers.includes(providerId))
      throw new CapabilityError("Unsupported capability or provider.");
    const provider = this.provider(providerId);
    if (!preview && (!capability.enabled || !provider.implemented))
      throw new CapabilityError("This capability is unavailable. Execution remains disabled.");
    return capability;
  }
}
export function getCapabilityRegistry() {
  return new CapabilityRegistry(process.env.NOVA_SOLANA_ENABLED === "true");
}

// A deliberately small, closed schema vocabulary, reusing Phase 2A identifier/integer validation.
export function validateField(schema: FieldSchema, value: unknown): string | number | string[] {
  if (schema.type === "address") return solanaAddress(value);
  if (schema.type === "signature") return solanaSignature(value);
  if (schema.type === "decimal") {
    if (typeof value !== "string" || atomicAmount(value, 9) <= 0n)
      throw new CapabilityError("Use a positive decimal amount with at most nine places.");
    return value;
  }
  if (schema.type === "percent" || schema.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (schema.type === "percent"
        ? value > 100 || !Number.isInteger(value * 100)
        : value > 120 || !Number.isInteger(value))
    )
      throw new CapabilityError("Invalid percentage or bounded integer.");
    return value;
  }
  if (schema.type === "addresses") {
    if (!Array.isArray(value) || !value.length || value.length > 10)
      throw new CapabilityError("Supply one to ten recipient addresses.");
    const addresses = value.map(solanaAddress);
    if (new Set(addresses).size !== addresses.length)
      throw new CapabilityError("Duplicate recipients.");
    return addresses;
  }
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 160 ||
    [...value].some((character) => character.charCodeAt(0) < 32) ||
    (schema.values && !schema.values.includes(value))
  )
    throw new CapabilityError("Invalid text value.");
  return value.trim();
}
