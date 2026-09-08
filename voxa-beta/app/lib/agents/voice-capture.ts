"use client";

import {
  getNovaMaxRecordingMs,
  getNovaSilenceThreshold,
  getNovaSilenceTimeoutMs,
} from "@/lib/voice-activation";

// Self-contained push-to-talk capture for the external-agent VOICE BETA. This is
// intentionally SEPARATE from RoomVoice / Nova Path A: it uses its OWN
// getUserMedia stream (never the LiveKit room mic), records a single
// silence-bounded clip, and tears the stream down on completion. It never
// publishes to a room — the returned Blob is uploaded once, and the reply audio
// is played LOCALLY via `playVoiceAudio`.

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

// Record one silence-bounded clip. Resolves with the recorded Blob. Calls
// `onStart` once recording actually begins (so the UI can show "Listening").
export async function captureVoiceClip(onStart?: () => void): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  const AudioCtor =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  const audioContext = AudioCtor ? new AudioCtor() : null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let rafId = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let hardCapTimer: ReturnType<typeof setTimeout> | null = null;
  let hasSpoken = false;
  let stopped = false;

  const cleanup = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    if (hardCapTimer) {
      clearTimeout(hardCapTimer);
    }
    source?.disconnect();
    analyser?.disconnect();
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Recording failed."));
    };

    try {
      recorder.start();
      onStart?.();
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Recording failed."));
      return;
    }

    hardCapTimer = setTimeout(stop, getNovaMaxRecordingMs());

    if (audioContext) {
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const threshold = getNovaSilenceThreshold();
      const silenceMs = getNovaSilenceTimeoutMs();

      const tick = () => {
        if (stopped || !analyser) {
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = (data[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / data.length);
        if (rms >= threshold) {
          hasSpoken = true;
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        } else if (hasSpoken && !silenceTimer) {
          // Stop after sustained silence once the user has spoken.
          silenceTimer = setTimeout(stop, silenceMs);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
  });
}

// Play a base64 TTS clip LOCALLY (HTMLAudioElement). Resolves when playback ends.
// This is the only place the agent's voice is heard — never the room.
export async function playVoiceAudio(base64: string, contentType: string | null): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
