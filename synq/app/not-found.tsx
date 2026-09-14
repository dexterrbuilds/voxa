import { BetaButton, BetaHeader, BetaShell } from "@/components/BetaChrome";

export default function NotFound() {
  return (
    <BetaShell>
      <BetaHeader />
      <section className="mx-auto max-w-xl px-6 py-20">
        <p className="mb-3 text-sm text-[var(--electric)]">Not found</p>
        <h1 className="text-2xl font-semibold">This page isn&apos;t available.</h1>
        <p className="my-5 text-[var(--muted-foreground)]">
          The link may be incorrect, or this profile may no longer be public.
        </p>
        <BetaButton href="/agents">Explore agents</BetaButton>
      </section>
    </BetaShell>
  );
}
