import { NovaProviderError } from "@/lib/server/nova/errors";

export async function transcribeWithDeepgram(audio: Blob) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new NovaProviderError({
      code: "transcription_failed",
      details: "DEEPGRAM_API_KEY is not configured.",
      provider: "deepgram",
    });
  }

  const response = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
    {
      body: audio,
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new NovaProviderError({
      code: "transcription_failed",
      details: `Deepgram transcription failed: ${response.status} ${errorText}`,
      provider: "deepgram",
      status: response.status,
    });
  }

  const payload = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
        }>;
      }>;
    };
  };
  const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

  if (!transcript) {
    throw new NovaProviderError({
      code: "transcription_failed",
      details: "Nova did not hear a clear prompt.",
      provider: "deepgram",
    });
  }

  return transcript;
}
