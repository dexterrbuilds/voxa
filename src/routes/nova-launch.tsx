import { Helmet } from "react-helmet-async";
import { ArrowUpRight, ArrowUp, Mic } from "lucide-react";
import { BETA_APP_URL } from "@/lib/links";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import "../../voxa-beta/app/glacier.css";

export default function NovaLaunchPage() {
  const href = `${BETA_APP_URL.replace(/\/$/, "")}/nova`;
  return (
    <div className="glacier-world glacier-landing min-h-dvh">
      <Helmet>
        <title>Synq · Nova</title>
        <meta
          name="description"
          content="Talk to Nova to understand on-chain activity and explore simulated action plans. No funds move."
        />
      </Helmet>
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <a href="/" className="synq-wordmark">
          <img src="/synq-mark.svg" alt="" />
          Synq
        </a>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <a href={href} className="text-sm font-medium">
            Open Nova <ArrowUpRight className="inline h-4 w-4" />
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-24">
        <img
          src="/nova-prism.svg"
          width={92}
          height={92}
          alt=""
          className="nova-presence mx-auto mb-8"
        />
        <h1 className="text-5xl font-semibold sm:text-7xl">Nova</h1>
        <p className="mt-6 text-2xl leading-tight sm:text-4xl">
          A conversation.
          <br />A clearer next move.
        </p>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Understand what happens on-chain. Explore an idea, explain a transaction, or review a
          simulated action plan. Start with a conversation.
        </p>
        <a
          href={href}
          className="glacier-primary mt-8 inline-flex min-h-12 items-center gap-3 px-6 py-3 font-semibold"
        >
          Talk to Nova <ArrowUpRight size={18} />
        </a>
        <div className="mx-auto mt-14 max-w-2xl border-t border-border pt-8 text-left">
          <p className="text-sm text-muted-foreground">What do you want to do on-chain?</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {["Swap 1 SOL to USDC", "Show my positions", "Explain this transaction"].map((s) => (
              <a href={href} key={s} className="glass-subtle rounded-lg px-4 py-3 text-sm">
                {s}
              </a>
            ))}
          </div>
          <a
            href={href}
            className="glacier-entry glass-surface mt-6 flex min-h-20 items-center gap-4 px-5"
          >
            <span className="flex-1 text-muted-foreground">Ask Nova…</span>
            <Mic size={19} />
            <ArrowUp size={20} />
          </a>
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            Actions are simulations. No transactions, real trades or funds movement.
            <br />
            Live balances and positions are not connected yet.
          </p>
        </div>
      </main>
      <footer className="px-6 pb-8 text-center text-xs text-muted-foreground">
        Nova is built by Synq. Never share a seed phrase or private key.
      </footer>
    </div>
  );
}
