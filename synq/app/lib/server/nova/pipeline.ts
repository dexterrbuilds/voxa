import { generateNovaResponse } from "@/lib/server/nova/providers/llm/gemini";
import { transcribeWithDeepgram } from "@/lib/server/nova/providers/stt/deepgram";

export async function runNovaPipeline(audio: Blob) {
  const transcript = await transcribeWithDeepgram(audio);
  const responseText = await generateNovaResponse(transcript);

  return {
    responseText,
    transcript,
  };
}
