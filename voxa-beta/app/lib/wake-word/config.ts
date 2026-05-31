"use client";

/**
 * Wake-word configuration. All values are PUBLIC (NEXT_PUBLIC_*) because
 * Picovoice Porcupine runs entirely in the browser. The Picovoice AccessKey is
 * the only secret here and it is intentionally client-side — it is NOT a backend
 * secret. Never put Deepgram / Gemini / OpenAI / Supabase service-role / LiveKit
 * secrets behind a NEXT_PUBLIC_ prefix.
 */

/** Picovoice AccessKey (browser-side). Required for wake detection to run. */
export function getPicovoiceAccessKey(): string {
  return (process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY ?? "").trim();
}

/** Display label for the wake word. Defaults to "Nova". */
export function getNovaWakeWordLabel(): string {
  return (process.env.NEXT_PUBLIC_NOVA_WAKE_WORD ?? "Nova").trim() || "Nova";
}

/**
 * Public path to a custom Porcupine `.ppn` keyword model for "Nova", generated
 * in the Picovoice Console for the Web/WASM platform (e.g. "/picovoice/nova.ppn").
 * When empty, the controller falls back to a built-in keyword.
 */
export function getNovaWakeWordModelPath(): string {
  return (process.env.NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH ?? "").trim();
}

/**
 * Public path to the Porcupine parameter model (`porcupine_params.pv`). Required
 * by Porcupine Web regardless of whether a built-in or custom keyword is used.
 * Defaults to "/picovoice/porcupine_params.pv".
 */
export function getPicovoiceModelPath(): string {
  return (process.env.NEXT_PUBLIC_PICOVOICE_MODEL_PATH ?? "").trim() || "/picovoice/porcupine_params.pv";
}
