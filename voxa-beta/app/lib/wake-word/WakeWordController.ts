"use client";

import type { PorcupineWorker } from "@picovoice/porcupine-web";
import {
  getNovaWakeWordLabel,
  getNovaWakeWordModelPath,
  getPicovoiceAccessKey,
  getPicovoiceModelPath,
  isWakeWordEnabled,
} from "./config";

export type WakeWordErrorReason =
  | "unsupported"
  | "missing-access-key"
  | "missing-keyword-file"
  | "missing-model-file"
  | "activation-limit"
  | "permission-denied"
  | "config-mismatch"
  | "init-failed";

export type WakeWordStartResult =
  | { ok: true; usingBuiltInFallback: boolean }
  | { ok: false; reason: WakeWordErrorReason };

type WakeDetectCallback = () => void;

/**
 * Framework-agnostic owner of a single Porcupine wake-word worker.
 *
 * PRIVACY: wake detection is 100% on-device. The microphone stream is consumed
 * locally by Picovoice's WASM worker (via WebVoiceProcessor) and never leaves
 * the browser. The backend only ever receives audio AFTER the wake word fires
 * and the existing Talk-to-Agent recording window opens (see RoomVoice).
 *
 * Lifecycle guarantees:
 * - At most one worker + one mic subscription exist at a time.
 * - Concurrent start() calls share one in-flight promise (no duplicate workers).
 * - stop() fully releases the worker and unsubscribes the mic.
 */
export class WakeWordController {
  private worker: PorcupineWorker | null = null;
  private startPromise: Promise<WakeWordStartResult> | null = null;
  private released = false;

  /** True only in environments capable of running the WASM worker + mic. */
  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof WebAssembly !== "undefined" &&
      typeof Worker !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  isRunning(): boolean {
    return this.worker !== null;
  }

  async start(onDetect: WakeDetectCallback): Promise<WakeWordStartResult> {
    if (this.worker) {
      return { ok: true, usingBuiltInFallback: !getNovaWakeWordModelPath() };
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.released = false;
    this.startPromise = this.#start(onDetect).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async #start(onDetect: WakeDetectCallback): Promise<WakeWordStartResult> {
    if (!isWakeWordEnabled()) {
      return { ok: false, reason: "missing-access-key" };
    }

    if (!WakeWordController.isSupported()) {
      return { ok: false, reason: "unsupported" };
    }

    const accessKey = getPicovoiceAccessKey();
    if (!accessKey) {
      return { ok: false, reason: "missing-access-key" };
    }

    try {
      // Lazy-load so Picovoice/WASM never runs during SSR or on pages that
      // don't use wake detection.
      const [{ PorcupineWorker, BuiltInKeyword }, { WebVoiceProcessor }] = await Promise.all([
        import("@picovoice/porcupine-web"),
        import("@picovoice/web-voice-processor"),
      ]);

      const customModelPath = getNovaWakeWordModelPath();
      const porcupineModelPath = getPicovoiceModelPath();
      const modelFilesOk = await verifyModelFiles({
        keywordPath: customModelPath,
        modelPath: porcupineModelPath,
      });

      if (!modelFilesOk.ok) {
        return { ok: false, reason: modelFilesOk.reason };
      }

      const usingBuiltInFallback = !customModelPath;
      // Custom "Nova" .ppn when provided; otherwise a distinctive built-in
      // keyword as a temporary stand-in (true "Nova" requires a Console model).
      const keyword = customModelPath
        ? {
            publicPath: customModelPath,
            label: getNovaWakeWordLabel(),
            customWritePath: `voxa_keyword_${getNovaWakeWordLabel().replace(/\W+/g, "_").toLowerCase()}`,
            forceWrite: true,
            sensitivity: 0.55,
            version: 1,
          }
        : BuiltInKeyword.Jarvis;

      const worker = await PorcupineWorker.create(
        accessKey,
        keyword,
        () => {
          // Detection callback — fired locally by the WASM worker.
          onDetect();
        },
        {
          publicPath: porcupineModelPath,
          customWritePath: "voxa_porcupine_params",
          forceWrite: true,
          version: 1,
        },
      );

      if (this.released) {
        // Disabled/unmounted while initializing — tear down immediately.
        try {
          worker.release();
        } catch {
          /* ignore */
        }
        worker.terminate();
        return { ok: false, reason: "init-failed" };
      }

      // Feed the local mic into the worker. WebVoiceProcessor owns getUserMedia;
      // audio frames go only to the WASM worker, never to the network.
      await WebVoiceProcessor.subscribe(worker);
      this.worker = worker;

      return { ok: true, usingBuiltInFallback };
    } catch (error) {
      await this.stop();
      const text = String(error instanceof Error ? error.message : error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const reason: WakeWordErrorReason = /activation.?limit/i.test(`${errorName} ${text}`)
        || /trial|expired|activation.?refused|activation.?throttled/i.test(`${errorName} ${text}`)
        ? "activation-limit"
        : /permission|denied|notallowed|dismiss/i.test(text)
        ? "permission-denied"
        : /access.?key|unauthori[sz]ed|forbidden|platform|keyword|model/i.test(text)
          ? "config-mismatch"
          : "init-failed";
      console.warn("Wake word startup failed.", {
        error: text,
        errorName,
        reason,
        keywordModelPath: getNovaWakeWordModelPath() || "built-in",
        modelPath: getPicovoiceModelPath(),
      });
      return { ok: false, reason };
    }
  }

  async stop(): Promise<void> {
    this.released = true;
    const worker = this.worker;
    this.worker = null;
    if (!worker) {
      return;
    }

    try {
      const { WebVoiceProcessor } = await import("@picovoice/web-voice-processor");
      await WebVoiceProcessor.unsubscribe(worker);
    } catch {
      /* ignore — best-effort cleanup */
    }

    try {
      worker.release();
    } catch {
      /* ignore */
    }

    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

async function verifyPublicFile(path: string) {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function verifyModelFiles({
  keywordPath,
  modelPath,
}: {
  keywordPath: string;
  modelPath: string;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "missing-keyword-file" | "missing-model-file" }
> {
  if (!(await verifyPublicFile(modelPath))) {
    return { ok: false, reason: "missing-model-file" };
  }

  if (keywordPath && !(await verifyPublicFile(keywordPath))) {
    return { ok: false, reason: "missing-keyword-file" };
  }

  return { ok: true };
}

export function wakeWordErrorMessage(reason: WakeWordErrorReason): string {
  switch (reason) {
    case "unsupported":
      return "Wake word isn't supported in this browser. Use Talk to Agent instead.";
    case "missing-access-key":
      return "Wake word needs a Picovoice AccessKey. Set NEXT_PUBLIC_PICOVOICE_ACCESS_KEY.";
    case "missing-keyword-file":
      return "Wake word keyword file was not found. Confirm NEXT_PUBLIC_NOVA_WAKE_WORD_MODEL_PATH points to a file in public/picovoice.";
    case "missing-model-file":
      return "Wake word model file was not found. Confirm NEXT_PUBLIC_PICOVOICE_MODEL_PATH points to public/picovoice/porcupine_params.pv.";
    case "activation-limit":
      return "Wake word activation limit reached for this Picovoice AccessKey. Create or reset the key in Picovoice Console, or use Talk to Agent.";
    case "permission-denied":
      return "Microphone permission was denied. Allow mic access to use wake word.";
    case "config-mismatch":
      return "Wake word config failed. Confirm the Picovoice AccessKey is valid and the keyword file was generated for Web/WASM.";
    case "init-failed":
    default:
      return "Wake word failed to start. Use Talk to Agent while checking the browser console.";
  }
}
