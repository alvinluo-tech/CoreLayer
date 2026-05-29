import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { env } from "../config/env.js";
import { getProviderCredentials, getProviders } from "../config/storage-config.js";

interface ProviderConfig {
  baseURL: string;
  apiKey: string;
}

const LEGACY_DEFAULTS: Record<string, { baseURL: string; envKey?: string }> = {
  mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1", envKey: "MIMO_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", envKey: "GROQ_API_KEY" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
  local: { baseURL: "http://localhost:11434/v1" },
};

function getEnvApiKey(envKey?: string): string {
  if (!envKey) return "";
  return process.env[envKey] ?? "";
}

function getProviderConfig(name: string): ProviderConfig {
  // 1. Check new providers list
  const providers = getProviders();
  const stored = providers.find((p) => p.id === name);
  if (stored) {
    return { baseURL: stored.baseURL, apiKey: stored.apiKey ?? "" };
  }

  // 2. Legacy: check providerCredentials
  const creds = getProviderCredentials();
  const ui = creds[name];

  // 3. Legacy: check hardcoded defaults + env vars
  const legacy = LEGACY_DEFAULTS[name];
  if (legacy) {
    return {
      baseURL: ui?.baseURL || legacy.baseURL,
      apiKey: ui?.apiKey || getEnvApiKey(legacy.envKey),
    };
  }

  // 4. Fallback: try to use whatever is in credentials
  if (ui) {
    return { baseURL: ui.baseURL ?? "", apiKey: ui.apiKey ?? "" };
  }

  throw new Error(`Provider not configured: ${name}`);
}

export function getProvider(name?: string) {
  const providerName = name ?? env.AI_PROVIDER;
  const config = getProviderConfig(providerName);
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}

export function getModel(providerName?: string, modelName?: string): LanguageModelV3 {
  const provider = getProvider(providerName);
  const model = modelName ?? env.AI_MODEL;
  return provider.chat(model);
}

export function getProviderName(): string {
  return env.AI_PROVIDER;
}
