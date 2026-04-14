import { GeminiProvider } from "./gemini";
import { MockAIProvider } from "./mock";
import { OpenAIProvider } from "./openai";

const requestedProvider = (process.env.AI_PROVIDER || "openai").toLowerCase();

const getProvider = () => {
  if (requestedProvider === "openai") return new OpenAIProvider();
  if (requestedProvider === "gemini") return new GeminiProvider();
  return new MockAIProvider();
};

export const aiProvider = getProvider();

export const parseLeadText = (rawText: string) => aiProvider.parseLeadText(rawText);
export const summarizeLead = (input: Parameters<typeof aiProvider.summarizeLead>[0]) =>
  aiProvider.summarizeLead(input);
export const suggestNextActions = (input: Parameters<typeof aiProvider.suggestNextActions>[0]) =>
  aiProvider.suggestNextActions(input);
