import { LockKeyhole } from "lucide-react";
import type { CapabilityPlan } from "@/lib/nova-launch/capability-types";

export function CapabilityPlanCard({ plan }: { plan: CapabilityPlan }) {
  return (
    <section className="nova-plan glass-elevated" aria-label="Nova planning preview">
      <div className="nova-kicker">
        Nova Plan · {plan.demonstration ? "Example only" : "Planning only"}
      </div>
      <h3>{plan.objective}</h3>
      <p className="nova-muted">
        Execution not enabled yet. No assets have been created, bought, sent or locked.
      </p>
      <ol className="space-y-4 my-5">
        {plan.steps.map((step, index) => (
          <li key={step.id} className="border-b border-[var(--border)] pb-3">
            <strong>
              {index + 1}. {step.name}
            </strong>
            <div className="nova-muted text-sm">{step.providerName}</div>
            {step.requiresWalletSignature && (
              <div className="flex items-center gap-2 mt-1 text-sm">
                <LockKeyhole size={14} />
                Future approval and wallet signature required
              </div>
            )}
            <details className="mt-2 text-sm">
              <summary>Plan details</summary>
              <dl className="break-words">
                {Object.entries(step.inputs).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                    <dd className="break-all">
                      {Array.isArray(value)
                        ? `${value.length} example addresses`
                        : typeof value === "object"
                          ? `Awaiting ${value.stepId}: ${value.artifact}`
                          : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="nova-muted">
                {step.dependencies.length ? `After: ${step.dependencies.join(", ")}. ` : ""}No
                result observed.
              </p>
            </details>
          </li>
        ))}
      </ol>
      <p className="nova-muted text-sm">
        {plan.demonstration
          ? "Illustrative allocation only; future balance, venue and lock checks are not implemented. Example addresses are not recipients to use with funds."
          : "Dependency validation is not execution approval."}
      </p>
    </section>
  );
}
