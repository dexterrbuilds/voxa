"use client";

import type { PorcupineWorker } from "@picovoice/porcupine-web";
import {
  getNovaWakeWordLabel,
  getNovaWakeWordModelPath,
  getPicovoiceAccessKey,
  getPicovoiceModelPath,
} from "./config";

export type WakeWordErrorReason =
  | "unsupported"
  | "missing-access-key"
  | "permission-denied"
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
 * and the existing Talk-to-Nova recording window opens (see RoomVoice).
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
      const usingBuiltInFallback = !customModelPath;
      // Custom "Nova" .ppn when provided; otherwise a distinctive built-in
      // keyword as a temporary stand-in (true "Nova" requires a Console model).
      const keyword = customModelPath
        ? { publicPath: customModelPath, label: getNovaWakeWordLabel() }
        : BuiltInKeyword.Jarvis;

      const worker = await PorcupineWorker.create(
        accessKey,
        keyword,
        () => {
          // Detection callback — fired locally by the WASM worker.
          onDetect();
        },
        { publicPath: getPicovoiceModelPath() },
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
      const reason: WakeWordErrorReason = /permission|denied|notallowed|dismiss/i.test(text)
        ? "permission-denied"
        : "init-failed";
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

export function wakeWordErrorMessage(reason: WakeWordErrorReason): string {
  switch (reason) {
    case "unsupported":
      return "Wake word isn't supported in this browser. Use Talk to Nova instead.";
    case "missing-access-key":
      return "Wake word needs a Picovoice AccessKey. Set NEXT_PUBLIC_PICOVOICE_ACCESS_KEY.";
    case "permission-denied":
      return "Microphone permission was denied. Allow mic access to use Wake Nova.";
    case "init-failed":
    default:
      return "Wake word failed to start. Confirm the Picovoice model file is in place.";
  }
}
