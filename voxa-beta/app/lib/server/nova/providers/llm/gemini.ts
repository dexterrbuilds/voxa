import { GoogleGenAI } from "@google/genai";
import {
  NovaProviderError,
  sanitizeErrorMessage,
  statusFromUnknown,
} from "@/lib/server/nova/errors";

function getCurrentDateContext(timeZone = "UTC") {
  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    timeZone,
    year: "numeric",
  });

  return {
    formattedDate,
    timeZone,
  };
}

function buildNovaSystemInstruction(timeZone?: string) {
  const dateContext = getCurrentDateContext(timeZone || "UTC");

  return `
You are Nova, a real-time conversational voice assistant inside Voxa.

Today's current date is strictly ${dateContext.formattedDate}.
Use timezone context: ${dateContext.timeZone}.

All temporal reasoning, scheduling, relative dates, and current-event discussions must anchor to this current date.

Always use available search grounding when current/live information may be relevant.

Keep responses:
- concise
- conversational
- voice-friendly
- natural

Avoid overly long paragraphs.
`.trim();
}

export async function generateNovaResponse(transcript: string, options?: { timeZone?: string }) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new NovaProviderError({
      code: "reasoning_failed",
      details: "GOOGLE_API_KEY is not configured.",
      provider: "gemini",
    });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const systemInstruction = buildNovaSystemInstruction(options?.timeZone);
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models
    .generateContent({
      config: {
        maxOutputTokens: 180,
        systemInstruction,
        temperature: 0.7,
        tools: [
          {
            googleSearch: {},
          },
        ],
      },
      contents: transcript,
      model,
    })
    .catch((error) => {
      throw new NovaProviderError({
        code: "reasoning_failed",
        details: sanitizeErrorMessage(error),
        provider: "gemini",
        status: statusFromUnknown(error),
      });
    });
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

  if (groundingMetadata) {
    console.info("nova.respond.gemini.grounding", {
      hasGroundingMetadata: true,
      groundingChunks: groundingMetadata.groundingChunks?.length ?? 0,
      groundingSupports: groundingMetadata.groundingSupports?.length ?? 0,
      webSearchQueries: groundingMetadata.webSearchQueries?.length ?? 0,
    });
  }

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
