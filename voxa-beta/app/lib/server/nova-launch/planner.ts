import { createHash, randomUUID } from "node:crypto";
import { canonical } from "./plans";
import {
  CapabilityError,
  CapabilityRegistry,
  getCapabilityRegistry,
  validateField,
} from "./capabilities";
import type {
  ArtifactReference,
  CapabilityPlan,
  CapabilityStep,
  PlanValue,
} from "@/lib/nova-launch/capability-types";

type StepProposal = {
  id: string;
  capabilityId: string;
  provider: string;
  inputs: Record<string, unknown>;
  dependencies: string[];
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new CapabilityError("Unsupported planning field. Policy is server-controlled.");
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stepId = /^[a-z][a-z0-9_]{0,39}$/;
function hash(plan: Omit<CapabilityPlan, "hash">) {
  return createHash("sha256").update(canonical(plan)).digest("hex");
}

export function createCapabilityPlan(
  ownerId: string,
  conversationId: string,
  proposal: unknown,
  registry: CapabilityRegistry = getCapabilityRegistry(),
  demonstration = false,
): CapabilityPlan {
  if (!uuid.test(ownerId) || !uuid.test(conversationId))
    throw new CapabilityError("Invalid plan ownership.");
  if (!record(proposal)) throw new CapabilityError("Invalid plan.");
  keys(proposal, ["objective", "steps"]);
  if (
    typeof proposal.objective !== "string" ||
    !proposal.objective.trim() ||
    proposal.objective.length > 500 ||
    !Array.isArray(proposal.steps) ||
    !proposal.steps.length ||
    proposal.steps.length > 12
  )
    throw new CapabilityError("Use a bounded objective and one to twelve steps.");
  const pending = new Map<string, StepProposal>();
  for (const raw of proposal.steps) {
    if (!record(raw)) throw new CapabilityError("Invalid step.");
    keys(raw, ["id", "capabilityId", "provider", "inputs", "dependencies"]);
    if (
      typeof raw.id !== "string" ||
      !stepId.test(raw.id) ||
      pending.has(raw.id) ||
      typeof raw.capabilityId !== "string" ||
      typeof raw.provider !== "string" ||
      !record(raw.inputs) ||
      !Array.isArray(raw.dependencies) ||
      raw.dependencies.length > 12 ||
      raw.dependencies.some((d) => typeof d !== "string" || !stepId.test(d)) ||
      new Set(raw.dependencies).size !== raw.dependencies.length
    )
      throw new CapabilityError("Invalid or duplicate step/dependency.");
    pending.set(raw.id, raw as StepProposal);
  }
  const ordered: StepProposal[] = [],
    visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new CapabilityError("Circular dependency.");
    const step = pending.get(id);
    if (!step) throw new CapabilityError("Unknown dependency.");
    visiting.add(id);
    step.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
    ordered.push(step);
  }
  pending.forEach((_, id) => visit(id));
  const completed = new Map<string, CapabilityStep>();
  for (const step of ordered) {
    const capability = registry.resolve(step.capabilityId, step.provider, demonstration);
    keys(step.inputs, Object.keys(capability.inputSchema));
    const inputs: Record<string, PlanValue> = {};
    for (const [key, schema] of Object.entries(capability.inputSchema)) {
      const value = step.inputs[key];
      if (value === undefined && schema.optional) continue;
      if (record(value)) {
        keys(value, ["stepId", "artifact"]);
        if (
          typeof value.stepId !== "string" ||
          typeof value.artifact !== "string" ||
          !step.dependencies.includes(value.stepId)
        )
          throw new CapabilityError("Artifact must reference a declared dependency.");
        const output = completed.get(value.stepId)?.outputSchema[value.artifact];
        if (!output || output.optional || output.type !== schema.type)
          throw new CapabilityError("Artifact type is unavailable or incompatible.");
        inputs[key] = {
          stepId: value.stepId,
          artifact: value.artifact,
        } satisfies ArtifactReference;
      } else inputs[key] = validateField(schema, value);
    }
    completed.set(step.id, {
      id: step.id,
      capabilityId: capability.id,
      name: capability.name,
      provider: step.provider,
      providerName: registry.provider(step.provider).name,
      inputs,
      dependencies: [...step.dependencies],
      status:
        capability.enabled && registry.provider(step.provider).implemented
          ? "planned"
          : "execution_disabled",
      riskLevel: capability.riskLevel,
      requiresApproval: capability.requiresApproval,
      requiresWalletSignature: capability.requiresWalletSignature,
      outputSchema: capability.outputSchema,
      artifacts: {},
    });
  }
  const body: Omit<CapabilityPlan, "hash"> = {
    version: 1,
    id: randomUUID(),
    ownerId,
    conversationId,
    objective: proposal.objective.trim(),
    mode: "planning_only",
    executionEnabled: false,
    demonstration,
    status: demonstration ? "draft" : "validated",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
    steps: [...completed.values()],
  };
  return { ...body, hash: hash(body) };
}
export function verifyCapabilityPlan(
  plan: CapabilityPlan,
  ownerId: string,
  conversationId: string,
) {
  const { hash: expected, ...body } = plan;
  if (
    plan.ownerId !== ownerId ||
    plan.conversationId !== conversationId ||
    hash(body) !== expected ||
    plan.executionEnabled !== false ||
    plan.mode !== "planning_only" ||
    !["draft", "validated"].includes(plan.status) ||
    !Number.isFinite(Date.parse(plan.expiresAt)) ||
    Date.parse(plan.expiresAt) <= Date.now()
  )
    throw new CapabilityError("Plan changed, expired or unavailable to this conversation.");
  // Revalidate fixed policy even if an untrusted caller recomputes the non-secret content hash.
  const registry = getCapabilityRegistry();
  for (const step of plan.steps) {
    const policy = registry.resolve(step.capabilityId, step.provider, true);
    if (
      step.riskLevel !== policy.riskLevel ||
      step.requiresApproval !== policy.requiresApproval ||
      step.requiresWalletSignature !== policy.requiresWalletSignature ||
      Object.keys(step.artifacts).length
    )
      throw new CapabilityError("Plan policy or evidence changed.");
  }
}
export function requirePlanExecution(): never {
  throw new CapabilityError(
    "Plan execution is not enabled. No signature or transaction can be requested.",
  );
}
