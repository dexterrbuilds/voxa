export async function transcribeWithDeepgram(audio: Blob) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured.");
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
    throw new Error(`Deepgram transcription failed: ${response.status} ${errorText}`);
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
  const transcript =
    payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

  if (!transcript) {
    throw new Error("Nova did not hear a clear prompt.");
  }

  return transcript;
}
