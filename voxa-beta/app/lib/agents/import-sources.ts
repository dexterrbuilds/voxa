// Bring Your Own Agent / self-import source model.
//
// An external agent can be a directly-built Voxa SDK endpoint, or an EXISTING
// agent from another runtime (OpenClaw, LangChain, CrewAI, AutoGen, …) that is
// wrapped behind a Voxa-compatible adapter endpoint. The import source is
// descriptive metadata only — it NEVER bypasses review, verification, sandbox, or
// permission gating. Imported runtimes (especially OpenClaw) are NOT trusted by
// default.
//
// This module is client-safe (pure types/data) so the server, dashboard, and
// public showcase share one source of truth.

export type ImportSource =
  | "custom_endpoint"
  | "openclaw"
  | "langchain"
  | "crewai"
  | "autogen"
  | "other";

export const DEFAULT_IMPORT_SOURCE: ImportSource = "custom_endpoint";

export type ImportSourceMeta = {
  // Label in the developer dashboard source selector.
  formLabel: string;
  // Public, non-scary label for the showcase.
  showcaseLabel: string;
  // One-line hint shown under the selector.
  hint: string;
};

export const IMPORT_SOURCE_META: Record<ImportSource, ImportSourceMeta> = {
  custom_endpoint: {
    formLabel: "Custom endpoint (Voxa SDK)",
    showcaseLabel: "Custom Endpoint",
    hint: "An endpoint you built directly against the Voxa agent contract.",
  },
  openclaw: {
    formLabel: "OpenClaw",
    showcaseLabel: "Imported from OpenClaw",
    hint: "Your OpenClaw agent must expose a Voxa-compatible adapter endpoint — OpenClaw is not wired up automatically and is not trusted by default.",
  },
  langchain: {
    formLabel: "LangChain",
    showcaseLabel: "Imported from LangChain",
    hint: "Wrap your LangChain agent behind a Voxa-compatible adapter endpoint.",
  },
  crewai: {
    formLabel: "CrewAI",
    showcaseLabel: "Imported from CrewAI",
    hint: "Wrap your CrewAI crew behind a Voxa-compatible adapter endpoint.",
  },
  autogen: {
    formLabel: "AutoGen",
    showcaseLabel: "Imported from AutoGen",
    hint: "Wrap your AutoGen agent behind a Voxa-compatible adapter endpoint.",
  },
  other: {
    formLabel: "Other runtime",
    showcaseLabel: "Imported agent",
    hint: "Any other runtime, wrapped behind a Voxa-compatible adapter endpoint.",
  },
};

export const IMPORT_SOURCES = Object.keys(IMPORT_SOURCE_META) as ImportSource[];

const IMPORT_SOURCE_SET = new Set<string>(IMPORT_SOURCES);

export function isImportSource(value: unknown): value is ImportSource {
  return typeof value === "string" && IMPORT_SOURCE_SET.has(value);
}

export function normalizeImportSource(value: unknown): ImportSource {
  return isImportSource(value) ? value : DEFAULT_IMPORT_SOURCE;
}

// Public showcase label. Returns null for the default custom endpoint so first
// party / native agents don't carry a redundant chip.
export function importSourceShowcaseLabel(value: unknown): string | null {
  const source = normalizeImportSource(value);
  if (source === "custom_endpoint") {
    return null;
  }
  return IMPORT_SOURCE_META[source].showcaseLabel;
}
