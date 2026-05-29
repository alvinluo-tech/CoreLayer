import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { env } from "../config/env.js";
import { getProviderCredentials } from "../config/storage-config.js";

export type AIProviderName = "mimo" | "groq" | "openrouter" | "local";

interface ProviderConfig {
  baseURL: string;
  apiKey: string;
}

function getProviderConfig(name: AIProviderName): ProviderConfig {
  const creds = getProviderCredentials();
  const ui = creds[name];

  switch (name) {
    case "mimo":
      return {
        baseURL: ui?.baseURL || env.MIMO_API_URL,
        apiKey: ui?.apiKey || env.MIMO_API_KEY,
      };
    case "groq":
      return {
        baseURL: ui?.baseURL || "https://api.groq.com/openai/v1",
        apiKey: ui?.apiKey || env.GROQ_API_KEY,
      };
    case "openrouter":
      return {
        baseURL: ui?.baseURL || "https://openrouter.ai/api/v1",
        apiKey: ui?.apiKey || env.OPENROUTER_API_KEY,
      };
    case "local":
      return {
        baseURL: ui?.baseURL || env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
        apiKey: ui?.apiKey || "ollama",
      };
  }
}

export function getProvider(name?: AIProviderName) {
  const providerName = name ?? env.AI_PROVIDER;
  const config = getProviderConfig(providerName);
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}

export function getModel(providerName?: AIProviderName, modelName?: string): LanguageModelV3 {
  const provider = getProvider(providerName);
  const model = modelName ?? env.AI_MODEL;
  return provider.chat(model);
}

export function getProviderName(): AIProviderName {
  return env.AI_PROVIDER;
}
