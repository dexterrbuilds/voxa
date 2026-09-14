import { platformEnabled } from "@/lib/product-features";
import "./glacier.css";

export default function Loading() {
  if (!platformEnabled)
    return (
      <div className="glacier-world glacier-loading" role="status" aria-label="Loading Synq">
        <img className="nova-presence" src="/nova-prism.svg" alt="" />
        <p>Opening Nova...</p>
      </div>
    );
  return (
    <div className="mx-auto max-w-5xl px-6 py-16" role="status" aria-label="Loading Synq">
      <img src="/synq-mark.svg" width={32} height={32} alt="" />
      <p className="mt-4 text-sm text-[var(--muted-foreground)]">Opening Synq...</p>
      <div className="mt-8 space-y-4 animate-pulse" aria-hidden="true">
        <div className="h-8 w-1/2 rounded bg-[var(--surface)]" />
        <div className="h-40 rounded bg-[var(--surface)]" />
      </div>
    </div>
  );
}
