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

// One prior conversation turn used as short-term room memory.
export type NovaTurn = {
  role: "user" | "nova";
  text: string;
};

function getMaxOutputTokens() {
  const parsed = Number(process.env.NOVA_MAX_OUTPUT_TOKENS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 700;
}

function buildNovaSystemInstruction(timeZone?: string) {
  const dateContext = getCurrentDateContext(timeZone || "UTC");

  return `
You are Nova, a real-time conversational voice assistant inside Voxa.

Today's current date is strictly ${dateContext.formattedDate}.
Use timezone context: ${dateContext.timeZone}.

All temporal reasoning, scheduling, relative dates, and current-event discussions must anchor to this current date.

Always use available search grounding when current/live information may be relevant.

You are in an ongoing voice conversation in a room. Earlier turns may be provided as
context. Use that history to stay on topic and to resolve references such as "that",
"it", "the topic", "he", or "again". If the user asks a follow-up, assume it relates to
the recent conversation unless they clearly change the subject.

Language: If the user speaks in a non-English language, understand and respond naturally
in that same language, unless they ask you to use a different one.

Length and pacing:
- Keep replies conversational, natural, and voice-friendly.
- By default keep them reasonably concise (a few sentences) and never cut off mid-thought.
- When the user asks for detail, examples, steps, or a longer explanation, give a fuller,
  complete answer.
- Do not pad, repeat yourself, or ramble when a short answer is enough.
`.trim();
}

export async function generateNovaResponse(
  transcript: string,
  options?: { timeZone?: string; history?: NovaTurn[] },
) {
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

  // Prepend recent turns so Nova keeps the room's topic in mind. Gemini "model"
  // role = Nova; "user" role = a human in the room.
  const history = (options?.history ?? []).filter((turn) => turn.text.trim().length > 0);
  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "nova" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: transcript }] },
  ];

  const response = await ai.models
    .generateContent({
      config: {
        maxOutputTokens: getMaxOutputTokens(),
        systemInstruction,
        temperature: 0.7,
        tools: [
          {
            googleSearch: {},
          },
        ],
      },
      contents,
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
