import { tts } from "edge-tts/out/index.js";

function speedToRate(speed: number) {
  const clamped = Math.min(2, Math.max(0.5, speed));
  const percentage = Math.round((clamped - 1) * 100);

  if (percentage === 0) {
    return "+0%";
  }

  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

export async function synthesizeWithEdge(text: string) {
  const provider = process.env.NOVA_TTS_PROVIDER || "edge";

  if (provider !== "edge") {
    throw new Error(`Unsupported Nova TTS provider: ${provider}`);
  }

  const voice = process.env.NOVA_TTS_VOICE || "en-US-JennyNeural";
  const speed = Number(process.env.NOVA_TTS_SPEED || 1.15);
  const audio = await tts(text, {
    pitch: "+0Hz",
    rate: speedToRate(speed),
    voice,
    volume: "+0%",
  });

  return {
    audio,
    contentType: "audio/mpeg",
    provider,
    voice,
  };
}
