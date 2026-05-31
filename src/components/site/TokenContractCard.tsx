import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

const VOXA_TOKEN_CA = "EEnjis1thqMgorpSA9q24R2QgYvCxMG2whRJzJzHpump";

export function TokenContractCard() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const flash = (didCopy: boolean) => {
    setCopied(didCopy);
    setFailed(!didCopy);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(VOXA_TOKEN_CA);
        flash(true);
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      // Legacy fallback for browsers without the async Clipboard API.
      try {
        const textarea = document.createElement("textarea");
        textarea.value = VOXA_TOKEN_CA;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        flash(ok);
      } catch {
        flash(false);
      }
    }
  };

  return (
    <div className="w-full max-w-xl">
      <div className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              VOXA Token CA
            </p>
            <div className="mt-1 overflow-x-auto">
              <code className="block whitespace-nowrap font-mono text-xs text-foreground sm:text-sm">
                {VOXA_TOKEN_CA}
              </code>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy VOXA token contract address"
            className="glass inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-all duration-300 hover:bg-white/[0.06] hover:border-electric/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {copied ? (
              <Check className="h-4 w-4 text-electric" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <p
        aria-live="polite"
        className={`mt-2 h-4 text-xs ${
          copied
            ? "text-electric"
            : failed
              ? "text-destructive"
              : "text-transparent"
        }`}
      >
        {copied ? "Contract address copied" : failed ? "Copy failed — select manually" : ""}
      </p>
    </div>
  );
}
