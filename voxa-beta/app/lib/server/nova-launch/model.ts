import { GoogleGenAI } from "@google/genai";
import { boundedContext } from "@/lib/nova-launch/actions";
import type { NovaModelProvider } from "@/lib/nova-launch/types";

export const geminiLaunchProvider: NovaModelProvider = {
  id: "gemini",
  async *stream({ context, prompt, signal }) {
    signal.throwIfAborted();
    if (!process.env.GOOGLE_API_KEY) throw new Error("Nova is unavailable. Try again shortly.");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateContentStream({
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      contents: [
        ...boundedContext(context).map((t) => ({
          role: t.role === "nova" ? "model" : "user",
          parts: [{ text: t.text }],
        })),
        { role: "user", parts: [{ text: prompt }] },
      ],
      config: {
        abortSignal: signal,
        maxOutputTokens: 700,
        systemInstruction: `You are Nova, Synq's conversational on-chain assistant. Current UTC time: ${new Date().toISOString()}.
Respond naturally in the user's language. Be concise unless asked for detail.
You can explain concepts, but cannot access wallets, balances, positions or blockchain activity.
All action plans are SIMULATIONS produced by a separate deterministic planner. Never claim to have executed, signed, quoted live prices or moved funds. Never interpret conversational agreement as approval. Do not invent supported protocols or tool calls. Never ask for seed phrases or private keys. Do not give personalized trading recommendations. Distinguish general information from verified facts. Search can inform explanations, not verify account state.`,
        tools: [{ googleSearch: {} }],
      },
    });
    for await (const chunk of response) {
      signal.throwIfAborted();
      if (chunk.text) yield { type: "text", delta: chunk.text };
    }
  },
};
export function getNovaModelProvider(): NovaModelProvider {
  const name = process.env.NOVA_MODEL_PROVIDER || "gemini";
  if (name !== "gemini") throw new Error("The configured Nova model is unavailable.");
  return geminiLaunchProvider;
}
