import { NovaProviderError, sanitizeErrorMessage } from "@/lib/server/nova/errors";
import { synthesizeWithEdge } from "@/lib/server/nova/providers/tts/edge";
import { synthesizeWithOpenAi } from "@/lib/server/nova/providers/tts/openai";

export type NovaTtsResult = {
  audio: Buffer;
  contentType: string;
  provider: string;
  voice: string;
};

function normalizeTtsProvider(provider: string | undefined) {
  const normalizedProvider = (provider || "edge").trim().toLowerCase();

  if (normalizedProvider === "openai" || normalizedProvider === "none") {
    return normalizedProvider;
  }

  return "edge";
}

async function synthesizeWithConfiguredProvider(text: string): Promise<NovaTtsResult | null> {
  const provider = normalizeTtsProvider(process.env.NOVA_TTS_PROVIDER);

  if (provider === "none") {
    return null;
  }

  if (provider === "openai") {
    return synthesizeWithOpenAi(text);
  }

  return synthesizeWithEdge(text);
}

export async function synthesizeNovaSpeech(text: string) {
  try {
    return await synthesizeWithConfiguredProvider(text);
  } catch (error) {
    const primaryError =
      error instanceof NovaProviderError
        ? error
        : new NovaProviderError({
            code: "tts_failed",
            details: sanitizeErrorMessage(error),
            provider: normalizeTtsProvider(process.env.NOVA_TTS_PROVIDER),
          });

    if (process.env.OPENAI_API_KEY && primaryError.provider !== "openai") {
      console.warn("nova.respond.tts.fallback", {
        details: primaryError.details,
        provider: primaryError.provider,
        status: primaryError.status,
      });
      return synthesizeWithOpenAi(text);
    }

    throw primaryError;
  }
}

