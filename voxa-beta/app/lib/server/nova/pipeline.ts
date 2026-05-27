import { generateNovaResponse } from "@/lib/server/nova/providers/llm/gemini";
import { transcribeWithDeepgram } from "@/lib/server/nova/providers/stt/deepgram";
import { synthesizeWithEdge } from "@/lib/server/nova/providers/tts/edge";

export async function runNovaPipeline(audio: Blob) {
  const transcript = await transcribeWithDeepgram(audio);
  const responseText = await generateNovaResponse(transcript);
  const synthesized = await synthesizeWithEdge(responseText);

  return {
    audio: synthesized.audio,
    audioContentType: synthesized.contentType,
    responseText,
    transcript,
    ttsProvider: synthesized.provider,
    ttsVoice: synthesized.voice,
  };
}
