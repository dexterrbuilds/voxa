"use client";

import { RotateCcw } from "lucide-react";
import { BetaButton, BetaHeader, BetaShell } from "@/components/BetaChrome";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <BetaShell>
      <BetaHeader />
      <section className="mx-auto max-w-xl px-6 py-20" role="alert">
        <h1 className="text-2xl font-semibold">We couldn&apos;t open this page.</h1>
        <p className="my-5 text-[var(--muted-foreground)]">
          Your connection or the service may be temporarily unavailable. Try again, or return to
          your rooms.
        </p>
        <div className="flex flex-wrap gap-3">
          <BetaButton onClick={reset}>
            <RotateCcw size={16} />
            Try again
          </BetaButton>
          <BetaButton href="/" variant="glass">
            Back to rooms
          </BetaButton>
        </div>
      </section>
    </BetaShell>
  );
}
