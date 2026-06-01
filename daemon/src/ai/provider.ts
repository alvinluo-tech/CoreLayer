import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { configManager } from "../config/config-manager.js";
import { resolveProvider } from "../config/provider-resolver.js";

interface ProviderConfig {
  baseURL: string;
  apiKey: string;
}

export function getProviderConfig(name: string): ProviderConfig {
  return resolveProvider(name);
}

export function getProvider(name?: string) {
  const providerName = name ?? configManager.getActiveProvider();
  const config = getProviderConfig(providerName);
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}

export function getModel(providerName?: string, modelName?: string): LanguageModelV3 {
  const provider = getProvider(providerName);
  const model = modelName ?? configManager.getActiveModel();
  return provider.chat(model);
}

export function getProviderName(): string {
  return configManager.getActiveProvider();
}
