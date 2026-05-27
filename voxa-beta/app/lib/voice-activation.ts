"use client";

import type { LocalParticipant } from "livekit-client";

type WakeWordStatus =
  | "disabled"
  | "initializing"
  | "sleeping"
  | "detected"
  | "error"
  | "stopped";

type WakeWordConfig = {
  accessKey?: string;
  keywordLabel: string;
  keywordPath?: string;
  modelPath?: string;
  sensitivity: number;
};

type WakeWordManagerCallbacks = {
  onDetect: () => void;
  onError: (message: string) => void;
  onStatusChange: (status: WakeWordStatus) => void;
};

type PorcupineWorkerHandle = {
  release: () => Promise<void>;
  terminate: () => void;
};

type VoiceActivationCallbacks = {
  onActivate: () => void;
  onDeactivate: () => void;
};

export class WakeWordManager {
  private handle: PorcupineWorkerHandle | null = null;
  private isStarted = false;

  constructor(
    private readonly config: WakeWordConfig,
    private readonly callbacks: WakeWordManagerCallbacks,
  ) {}

  async start() {
    if (this.isStarted) {
      return;
    }

    if (!this.config.accessKey || !this.config.keywordPath || !this.config.modelPath) {
      this.callbacks.onStatusChange("disabled");
      this.callbacks.onError(
        "Wake word needs Picovoice access key, Nova keyword model, and Porcupine model.",
      );
      return;
    }

    this.isStarted = true;
    this.callbacks.onStatusChange("initializing");

    try {
      const [{ PorcupineWorker }, { WebVoiceProcessor }] = await Promise.all([
        import("@picovoice/porcupine-web"),
        import("@picovoice/web-voice-processor"),
      ]);

      const worker = await PorcupineWorker.create(
        this.config.accessKey,
        {
          label: this.config.keywordLabel,
          publicPath: this.config.keywordPath,
          sensitivity: this.config.sensitivity,
        },
        () => {
          this.callbacks.onStatusChange("detected");
          this.callbacks.onDetect();
        },
        {
          publicPath: this.config.modelPath,
        },
        {
          processErrorCallback: (error) => {
            this.callbacks.onError(error.message || "Wake word processing failed.");
          },
        },
      );

      this.handle = worker;
      await WebVoiceProcessor.subscribe(worker);
      this.callbacks.onStatusChange("sleeping");
    } catch (error) {
      this.isStarted = false;
      this.callbacks.onStatusChange("error");
      this.callbacks.onError(
        error instanceof Error ? error.message : "Wake word detection could not start.",
      );
      await this.stop();
    }
  }

  async stop() {
    if (!this.isStarted && !this.handle) {
      return;
    }

    const handle = this.handle;
    this.handle = null;
    this.isStarted = false;

    if (handle) {
      const { WebVoiceProcessor } = await import("@picovoice/web-voice-processor");
      await WebVoiceProcessor.unsubscribe(handle as never).catch(() => undefined);
      await handle.release().catch(() => undefined);
      handle.terminate();
    }

    this.callbacks.onStatusChange("stopped");
  }
}

export class MicStateController {
  constructor(private readonly participant: LocalParticipant) {}

  async primeMutedTrack() {
    await this.participant.setMicrophoneEnabled(true);
    await this.participant.setMicrophoneEnabled(false);
  }

  async unmute() {
    await this.participant.setMicrophoneEnabled(true);
  }

  async mute() {
    await this.participant.setMicrophoneEnabled(false);
  }
}

export class VoiceActivationController {
  private timeoutId: number | null = null;
  private expiresAt: number | null = null;

  constructor(
    private readonly mic: MicStateController,
    private readonly activeMs: number,
    private readonly callbacks: VoiceActivationCallbacks,
  ) {}

  async activate() {
    this.clearTimer();
    await this.mic.unmute();
    this.expiresAt = Date.now() + this.activeMs;
    this.callbacks.onActivate();

    this.timeoutId = window.setTimeout(() => {
      void this.deactivate();
    }, this.activeMs);
  }

  async deactivate() {
    this.clearTimer();
    await this.mic.mute();
    this.expiresAt = null;
    this.callbacks.onDeactivate();
  }

  dispose() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  getRemainingMs() {
    return Math.max(0, (this.expiresAt ?? 0) - Date.now());
  }
}

export function getWakeWordConfig(): WakeWordConfig {
  return {
    accessKey: process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY,
    keywordLabel: process.env.NEXT_PUBLIC_WAKE_WORD || "Nova",
    keywordPath: process.env.NEXT_PUBLIC_PICOVOICE_KEYWORD_PATH,
    modelPath: process.env.NEXT_PUBLIC_PICOVOICE_MODEL_PATH,
    sensitivity: Number(process.env.NEXT_PUBLIC_PICOVOICE_SENSITIVITY || 0.65),
  };
}

export function getNovaListenWindowMs() {
  return Number(
    process.env.NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS || process.env.NEXT_PUBLIC_NOVA_ACTIVE_MS || 10000,
  );
}
