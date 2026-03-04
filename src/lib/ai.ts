import OpenAI from "openai";

const globalForAI = globalThis as unknown as { ai: OpenAI };

export const ai =
  globalForAI.ai ||
  new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForAI.ai = ai;
