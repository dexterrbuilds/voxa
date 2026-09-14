"use client";

function readNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getNovaListenWindowMs() {
  return readNumberEnv(
    process.env.NEXT_PUBLIC_NOVA_LISTEN_WINDOW_MS || process.env.NEXT_PUBLIC_NOVA_ACTIVE_MS,
    10000,
  );
}

// How long the user must be silent (after speaking) before Nova stops capturing
// and sends the prompt to the backend pipeline.
export function getNovaSilenceTimeoutMs() {
  return readNumberEnv(process.env.NEXT_PUBLIC_NOVA_SILENCE_TIMEOUT_MS, 2000);
}

// Hard ceiling on a single capture so the recorder can never run forever.
export function getNovaMaxRecordingMs() {
  return readNumberEnv(process.env.NEXT_PUBLIC_NOVA_MAX_RECORDING_MS, 15000);
}

// RMS amplitude (0..1) below which a frame is treated as silence.
export function getNovaSilenceThreshold() {
  const parsed = Number(process.env.NEXT_PUBLIC_NOVA_SILENCE_THRESHOLD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.015;
}
