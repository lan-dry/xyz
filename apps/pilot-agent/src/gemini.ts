import { GoogleGenerativeAI } from "@google/generative-ai";
import type { PilotConfig } from "./config.js";
import { preview } from "./governance.js";

export type GeminiResult = {
  text: string;
  mock: boolean;
};

export async function runGemini(
  config: PilotConfig,
  systemInstruction: string,
  userPrompt: string,
): Promise<GeminiResult> {
  if (!config.geminiApiKey) {
    return mockReply(userPrompt, "GEMINI_API_KEY not set");
  }

  try {
    const gen = new GoogleGenerativeAI(config.geminiApiKey);
    const model = gen.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction,
    });
    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    return { text, mock: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  Gemini unavailable (${message.slice(0, 120)}…) — using MOCK for this step`);
    return mockReply(userPrompt, "Gemini API error or quota");
  }
}

function mockReply(userPrompt: string, reason: string): GeminiResult {
  const text = `[MOCK Gemini — ${reason}] ${preview(userPrompt, 80)} → demo response for Salanor trace.`;
  return { text, mock: true };
}
