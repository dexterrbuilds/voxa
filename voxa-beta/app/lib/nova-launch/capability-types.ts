// Serializable descriptors only. Neither provider objects nor executable payloads enter the UI.
export type RiskLevel =
  | "READ"
  | "QUOTE"
  | "LOW_RISK_ACTION"
  | "ASSET_TRANSFER"
  | "TOKEN_LAUNCH"
  | "LEVERAGED_POSITION"
  | "ADMINISTRATIVE";
export type FieldSchema = {
  type: "text" | "address" | "signature" | "decimal" | "percent" | "integer" | "addresses";
  optional?: boolean;
  values?: readonly string[];
};
export type RecordSchema = Readonly<Record<string, FieldSchema>>;
export type ArtifactReference = { stepId: string; artifact: string };
export type PlanValue = string | number | string[] | ArtifactReference;
export type Capability = {
  id: string;
  name: string;
  description: string;
  category: string;
  providers: readonly string[];
  inputSchema: RecordSchema;
  outputSchema: RecordSchema;
  riskLevel: RiskLevel;
  readOnly: boolean;
  stateChanging: boolean;
  requiresApproval: boolean;
  requiresWalletSignature: boolean;
  enabled: boolean;
};
export type CapabilityProvider = {
  id: string;
  name: string;
  implemented: boolean;
  mode: "read_only" | "quote_only" | "planned";
};
export type CapabilityPlanStatus =
  | "draft"
  | "validated"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "partially_completed"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";
export type CapabilityStep = {
  id: string;
  capabilityId: string;
  name: string;
  provider: string;
  providerName: string;
  inputs: Record<string, PlanValue>;
  dependencies: string[];
  status: "planned" | "execution_disabled";
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  requiresWalletSignature: boolean;
  // Declared output slots are NOT observed results. Empty until a future trusted runner supplies evidence.
  outputSchema: RecordSchema;
  artifacts: Record<string, never>;
};
export type CapabilityPlan = {
  version: 1;
  id: string;
  ownerId: string;
  conversationId: string;
  objective: string;
  mode: "planning_only";
  executionEnabled: false;
  demonstration: boolean;
  status: CapabilityPlanStatus;
  createdAt: string;
  expiresAt: string;
  steps: CapabilityStep[];
  hash: string;
};
