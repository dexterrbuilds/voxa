"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import type { ImportSource } from "@/lib/agents/import-sources";

export type DetectedAgent = {
  name: string;
  description: string;
  capabilities: string[];
  importSource: ImportSource;
  supports: { text: boolean; voice: boolean; tools: boolean };
  protocol: string;
  sdkVersion: string;
};

export function AgentConnectionTest({
  endpointUrl,
  onDetected,
}: {
  endpointUrl: string;
  onDetected?: (agent: DetectedAgent) => void;
}) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ detected: DetectedAgent; durationMs: number } | null>(
    null,
  );
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError(null);
    setResult(null);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [endpointUrl]);
  async function test() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(null);
    setResult(null);
    const timeout = setTimeout(() => current.abort(), 10000);
    try {
      const session = await getSupabaseClient()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in to test your agent.");
      const response = await fetch("/api/agents/discover", {
        method: "POST",
        signal: current.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endpointUrl }),
      });
      const data = await response.json();
      if (controller.current !== current || current.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "Connection test failed. Please try again.");
      setResult(data);
    } catch (caught) {
      if (controller.current === current)
        setError(
          current.signal.aborted
            ? "Connection test stopped. Try again."
            : caught instanceof Error
              ? caught.message
              : "Could not test this endpoint.",
        );
    } finally {
      clearTimeout(timeout);
      if (controller.current === current) setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      <button
        type="button"
        disabled={busy || !endpointUrl.trim()}
        onClick={() => void test()}
        className="beta-button-glass min-h-11 gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}{" "}
        {busy ? "Connecting" : "Test connection"}
      </button>
      {error && (
        <p role="alert" className="text-[var(--foreground)]">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-3 border-l-2 border-emerald-500 pl-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {result.detected.name || "Agent"}{" "}
            detected{" "}
            <span className="text-xs text-[var(--muted-foreground)]">{result.durationMs} ms</span>
          </p>
          <p className="text-[var(--muted-foreground)]">
            {Object.entries(result.detected.supports)
              .filter(([, enabled]) => enabled)
              .map(([name]) => `${name[0].toUpperCase()}${name.slice(1)} supported`)
              .join(" · ")}
          </p>
          {onDetected && (
            <button
              type="button"
              className="beta-button-glass"
              onClick={() => onDetected(result.detected)}
            >
              Use detected details
            </button>
          )}
          <details className="text-xs text-[var(--muted-foreground)]">
            <summary className="cursor-pointer">Connection details</summary>
            <p className="mt-2">
              {result.detected.protocol} · SDK {result.detected.sdkVersion}. Reported capabilities
              do not grant room permissions.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
