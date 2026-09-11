"use client";
import {
  getNovaMaxRecordingMs,
  getNovaSilenceThreshold,
  getNovaSilenceTimeoutMs,
} from "@/lib/voice-activation";
// A separate capture stream: never changes a room's LiveKit mic state.
export async function startCapture(
  onDone: (audio: Blob) => void,
  onError: (message: string) => void,
) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext | undefined;
  let recorder: MediaRecorder;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout>;
  let cancelled = false;
  let cleaned = false;
  const chunks: Blob[] = [];
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((t) => t.stop());
    if (context && context.state !== "closed") void context.close().catch(() => {});
  };
  try {
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      cleanup();
      if (!cancelled) {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size) onDone(blob);
        else onError("No audio captured. Please try again.");
      }
    };
    recorder.onerror = () => {
      cancelled = true;
      cleanup();
      onError("Recording stopped. Please try again.");
    };
    context = new AudioContext();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let heard = false,
      lastSpeech = performance.now();
    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
      if (rms > getNovaSilenceThreshold()) {
        heard = true;
        lastSpeech = performance.now();
      }
      if (heard && performance.now() - lastSpeech > getNovaSilenceTimeoutMs()) {
        stop();
        return;
      }
      frame = requestAnimationFrame(measure);
    };
    recorder.start(250);
    frame = requestAnimationFrame(measure);
    timer = setTimeout(stop, Math.min(getNovaMaxRecordingMs(), 30000));
    return {
      stop,
      cancel: () => {
        cancelled = true;
        stop();
        cleanup();
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
