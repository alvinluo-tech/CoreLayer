import { ModelGateway, DEFAULT_PROFILES, DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";
import type { ModelProviderName, ProviderConfig, ModelProfile } from "@jarvis/types";
import { env } from "../config/env.js";
import {
  getProviderCredentials,
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
    // model_profiles repo returns rows, need to map to ModelProfile shape
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
        provider: r.provider as ModelProviderName,
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

export function getModelGateway(): ModelGateway {
  if (gateway) return gateway;

  const creds = getProviderCredentials();
  const dbProfiles = getDbProfiles();
  const profiles = dbProfiles ?? DEFAULT_PROFILES;
  const customRules = getRoutingRules();
  const routingRules = customRules ?? DEFAULT_ROUTING_RULES;
  const activeModelId = getActiveModelId() ?? getDefaultModelId();

  const providers: Record<ModelProviderName, ProviderConfig> = {
    mimo: {
      baseURL: creds.mimo?.baseURL ?? env.MIMO_API_URL,
      apiKey: creds.mimo?.apiKey ?? env.MIMO_API_KEY,
      models: profiles.filter((p) => p.provider === "mimo"),
    },
    groq: {
      baseURL: creds.groq?.baseURL ?? "https://api.groq.com/openai/v1",
      apiKey: creds.groq?.apiKey ?? env.GROQ_API_KEY,
      models: profiles.filter((p) => p.provider === "groq"),
    },
    openrouter: {
      baseURL: creds.openrouter?.baseURL ?? "https://openrouter.ai/api/v1",
      apiKey: creds.openrouter?.apiKey ?? env.OPENROUTER_API_KEY,
      models: profiles.filter((p) => p.provider === "openrouter"),
    },
    local: {
      baseURL: creds.local?.baseURL ?? env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      apiKey: creds.local?.apiKey ?? "ollama",
      models: profiles.filter((p) => p.provider === "local"),
    },
  };

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
