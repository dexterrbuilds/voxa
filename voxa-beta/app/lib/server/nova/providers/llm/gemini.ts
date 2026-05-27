import { GoogleGenAI } from "@google/genai";
import { NovaProviderError, sanitizeErrorMessage, statusFromUnknown } from "@/lib/server/nova/errors";

const novaSystemPrompt =
  "You are Nova, a calm, intelligent, warm AI voice participant in a private Voxa room. " +
  "Respond concisely and conversationally. You only speak when directly activated. " +
  "Keep responses short unless asked for detail.";

export async function generateNovaResponse(transcript: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new NovaProviderError({
      code: "reasoning_failed",
      details: "GOOGLE_API_KEY is not configured.",
      provider: "gemini",
    });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    config: {
      maxOutputTokens: 180,
      systemInstruction: novaSystemPrompt,
      temperature: 0.7,
    },
    contents: transcript,
    model,
  }).catch((error) => {
    throw new NovaProviderError({
      code: "reasoning_failed",
      details: sanitizeErrorMessage(error),
      provider: "gemini",
      status: statusFromUnknown(error),
    });
  });
  const text = response.text?.trim();

  if (!text) {
    throw new NovaProviderError({
      code: "reasoning_failed",
      details: "Gemini did not return a response.",
      provider: "gemini",
    });
  }

  return text;
}
