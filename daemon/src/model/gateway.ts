import { ModelGateway, DEFAULT_PROFILES, DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";
import type { ProviderConfig, ModelProfile } from "@jarvis/types";
import { configManager } from "../config/config-manager.js";
import { resolveProvider, LEGACY_DEFAULTS } from "../config/provider-resolver.js";
import { getRepositories } from "../db/factory.js";

let gateway: ModelGateway | null = null;

export function resetGateway(): void {
  gateway = null;
}

function getDbProfiles(): ModelProfile[] | null {
  try {
    const repos = getRepositories();
    const rows = (repos.modelProfiles as unknown as { getAll: () => unknown[] }).getAll();
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

export function getModelGateway(): ModelGateway {
  if (gateway) return gateway;

  const dbProfiles = getDbProfiles();
  const profiles = dbProfiles ?? DEFAULT_PROFILES;
  const customRules = configManager.getRoutingRules();
  const routingRules = customRules.length > 0 ? customRules : DEFAULT_ROUTING_RULES;
  const activeModelId = configManager.getActiveModel();

  // Build providers from configManager
  const storedProviders = configManager.getProviders();
  const providers: Record<string, ProviderConfig> = {};

  if (storedProviders.length > 0) {
    for (const sp of storedProviders) {
      if (!sp.enabled) continue;
      const resolved = resolveProvider(sp.id);
      providers[sp.id] = {
        baseURL: resolved.baseURL,
        apiKey: resolved.apiKey,
        models: profiles.filter((p) => p.provider === sp.id),
      };
    }
  }

  // Ensure all profile providers have an entry
  const profileProviders = new Set(profiles.map((p) => p.provider));
  for (const provName of profileProviders) {
    if (!providers[provName]) {
      const resolved = resolveProvider(provName);
      providers[provName] = {
        baseURL: resolved.baseURL,
        apiKey: resolved.apiKey,
        models: profiles.filter((p) => p.provider === provName),
      };
    }
  }

  // Ensure legacy providers exist for backward compat
  for (const legacyId of Object.keys(LEGACY_DEFAULTS)) {
    if (!providers[legacyId]) {
      try {
        const resolved = resolveProvider(legacyId);
        providers[legacyId] = {
          baseURL: resolved.baseURL,
          apiKey: resolved.apiKey,
          models: profiles.filter((p) => p.provider === legacyId),
        };
      } catch {
        // Skip providers that can't be resolved
      }
    }
  }

  gateway = new ModelGateway({
    defaultModelId: activeModelId,
    routingRules: routingRules as any,
    providers,
    profiles,
  });

  return gateway;
}
