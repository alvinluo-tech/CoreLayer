import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { configManager } from "../config/config-manager.js";
import { resolveProvider } from "../config/provider-resolver.js";
import { DEFAULT_PROFILES } from "@jarvis/model-gateway";

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

/**
 * Resolve a profile ID (e.g. "mimo-2.5-pro") to the actual API model name (e.g. "mimo-v2.5-pro").
 * Falls back to the input if no profile matches.
 */
function resolveModelName(profileId: string): string {
  const profile = DEFAULT_PROFILES.find((p) => p.id === profileId);
  return profile?.modelName ?? profileId;
}

export function getModel(providerName?: string, modelName?: string): LanguageModelV3 {
  const provider = getProvider(providerName);
  const modelId = modelName ?? configManager.getActiveModel();
  return provider.chat(resolveModelName(modelId));
}

export function getProviderName(): string {
  return configManager.getActiveProvider();
}
