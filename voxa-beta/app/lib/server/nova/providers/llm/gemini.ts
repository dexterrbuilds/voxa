import { GoogleGenAI } from "@google/genai";

const novaSystemPrompt =
  "You are Nova, a calm, intelligent, warm AI voice participant in a private Voxa room. " +
  "Respond concisely and conversationally. You only speak when directly activated. " +
  "Keep responses short unless asked for detail.";

export async function generateNovaResponse(transcript: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured.");
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
  });
  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini did not return a response.");
  }

  return text;
}
