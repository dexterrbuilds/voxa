"use client";

import type { LocalParticipant } from "livekit-client";

type VoiceActivationCallbacks = {
  onActivate: () => void;
  onDeactivate: () => void;
};

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

export function getNovaListenWindowMs() {
  return Number(
    process.env.NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS || process.env.NEXT_PUBLIC_NOVA_ACTIVE_MS || 10000,
  );
}
