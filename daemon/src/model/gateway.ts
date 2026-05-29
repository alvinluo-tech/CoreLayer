import { ModelGateway, DEFAULT_PROFILES, DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";
import type { ProviderConfig, ModelProfile } from "@jarvis/types";
import { env } from "../config/env.js";
import {
  getProviderCredentials,
  getProviders,
  getRoutingRules,
  getActiveModelId,
} from "../config/storage-config.js";
import { getRepositories } from "../db/factory.js";

let gateway: ModelGateway | null = null;

export function resetGateway(): void {
  gateway = null;
}

function getDbProfiles(): ModelProfile[] | null {
  try {
    const repos = getRepositories();
    const rows = (repos.modelProfiles as { getAll: () => unknown[] }).getAll();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return rows.map((row: unknown) => {
      const r = row as {
        id: string;
        provider: string;
        modelName: string;
        displayName: string | null;
        capabilities: unknown;
        limits: unknown;
        cost: unknown;
      };
      return {
        id: r.id,
        provider: r.provider,
        modelName: r.modelName,
        displayName: r.displayName ?? r.modelName,
        capabilities: (r.capabilities as ModelProfile["capabilities"]) ?? {
          text: true,
          streaming: true,
          toolCalling: false,
          vision: false,
          audioInput: false,
          tts: false,
          jsonMode: false,
          longContext: false,
        },
        limits: (r.limits as ModelProfile["limits"]) ?? {
          contextWindow: 128000,
          maxOutputTokens: 4096,
        },
        cost: (r.cost as ModelProfile["cost"]) ?? { input: 0, output: 0 },
      };
    });
  } catch {
    return null;
  }
}

// Legacy env-based defaults for the original 4 providers
const LEGACY_ENV_MAP: Record<string, { baseURL: string; envKey?: string }> = {
  mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1", envKey: "MIMO_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", envKey: "GROQ_API_KEY" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
  local: { baseURL: "http://localhost:11434/v1" },
};

function resolveProviderBaseURL(storedId: string, storedBaseURL?: string): string {
  if (storedBaseURL) return storedBaseURL;
  const legacy = LEGACY_ENV_MAP[storedId];
  if (legacy) return legacy.baseURL;
  return "";
}

function resolveProviderApiKey(storedId: string, storedApiKey?: string): string {
  if (storedApiKey) return storedApiKey;
  // Check legacy credentials
  const creds = getProviderCredentials();
  if (creds[storedId]?.apiKey) return creds[storedId].apiKey!;
  // Check env vars
  const legacy = LEGACY_ENV_MAP[storedId];
  if (legacy?.envKey) return process.env[legacy.envKey] ?? "";
  if (storedId === "local") return "ollama";
  return "";
}

export function getModelGateway(): ModelGateway {
  if (gateway) return gateway;

  const dbProfiles = getDbProfiles();
  const profiles = dbProfiles ?? DEFAULT_PROFILES;
  const customRules = getRoutingRules();
  const routingRules = customRules ?? DEFAULT_ROUTING_RULES;
  const activeModelId = getActiveModelId() ?? getDefaultModelId();

  // Build providers from stored providers, falling back to legacy config
  const storedProviders = getProviders();
  const providers: Record<string, ProviderConfig> = {};

  if (storedProviders.length > 0) {
    // New dynamic system
    for (const sp of storedProviders) {
      if (!sp.enabled) continue;
      providers[sp.id] = {
        baseURL: resolveProviderBaseURL(sp.id, sp.baseURL),
        apiKey: resolveProviderApiKey(sp.id, sp.apiKey),
        models: profiles.filter((p) => p.provider === sp.id),
      };
    }
  }

  // Ensure all profile providers have an entry (fallback for profiles without stored providers)
  const profileProviders = new Set(profiles.map((p) => p.provider));
  for (const provName of profileProviders) {
    if (!providers[provName]) {
      providers[provName] = {
        baseURL: resolveProviderBaseURL(provName),
        apiKey: resolveProviderApiKey(provName),
        models: profiles.filter((p) => p.provider === provName),
      };
    }
  }

  // Ensure at least the 4 legacy providers exist (for backward compat)
  for (const legacyId of Object.keys(LEGACY_ENV_MAP)) {
    if (!providers[legacyId]) {
      providers[legacyId] = {
        baseURL: resolveProviderBaseURL(legacyId),
        apiKey: resolveProviderApiKey(legacyId),
        models: profiles.filter((p) => p.provider === legacyId),
      };
    }
  }

  gateway = new ModelGateway({
    defaultModelId: activeModelId,
    routingRules,
    providers,
    profiles,
  });

  return gateway;
}

function getDefaultModelId(): string {
  const provider = env.AI_PROVIDER;
  const model = env.AI_MODEL;

  // Match to a known profile
  for (const profile of DEFAULT_PROFILES) {
    if (profile.provider === provider && profile.modelName === model) {
      return profile.id;
    }
  }

  // Fallback based on provider
  switch (provider) {
    case "mimo": return "mimo-2.5-pro";
    case "groq": return "groq-llama";
    case "openrouter": return "openrouter-default";
    case "local": return "local-ollama";
    default: return "mimo-2.5-pro";
  }
}
