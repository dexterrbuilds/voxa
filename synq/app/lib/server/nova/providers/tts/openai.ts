import { NovaProviderError, sanitizeErrorMessage } from "@/lib/server/nova/errors";

function speedForOpenAi() {
  const speed = Number(process.env.NOVA_TTS_SPEED || 1.15);
  return Math.min(4, Math.max(0.25, speed));
}

export async function synthesizeWithOpenAi(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new NovaProviderError({
      code: "tts_failed",
      details: "OPENAI_API_KEY is not configured.",
      provider: "openai",
    });
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.NOVA_TTS_VOICE || "coral";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    body: JSON.stringify({
      input: text,
      instructions: "Speak as Nova: warm, clear, feminine, concise, and naturally paced.",
      model,
      response_format: "mp3",
      speed: speedForOpenAi(),
      voice,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new NovaProviderError({
      code: "tts_failed",
      details: `OpenAI TTS failed: ${response.status} ${sanitizeErrorMessage(errorText)}`,
      provider: "openai",
      status: response.status,
    });
  }

  return {
    audio: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
    provider: "openai",
    voice,
  };
}
