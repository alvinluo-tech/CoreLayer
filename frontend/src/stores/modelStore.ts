import { create } from "zustand";
import {
  getProviderConfigs,
  updateProviderConfig as tauriUpdateProvider,
  getRoutingRules as tauriGetRoutingRules,
  updateRoutingRules as tauriUpdateRoutingRules,
  getActiveModel,
  setActiveModel as tauriSetActiveModel,
  listModelProfiles,
  upsertModelProfile as tauriUpsertProfile,
  deleteModelProfile as tauriDeleteProfile,
  listProviderPresets,
  addProvider as tauriAddProvider,
  removeProvider as tauriRemoveProvider,
  discoverModels as tauriDiscoverModels,
  testProviderConnection as tauriTestProviderConnection,
  type ModelProfile,
  type ProviderCredentialView,
  type RoutingRule,
  type ProviderPreset,
} from "@/lib/tauri";

export interface ProviderEntry {
  id: string;
  name: string;
  type: string;
  baseURL: string;
  apiKey: string; // masked
  enabled: boolean;
  modelCount: number;
}

interface ModelState {
  providers: ProviderEntry[];
  providerPresets: ProviderPreset[];
  routingRules: RoutingRule[];
  routingRulesCustom: boolean;
  activeModelId: string | null;
  activeModelProfile: ModelProfile | null;
  modelProfiles: ModelProfile[];
  isLoading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  addProvider: (presetId: string, apiKey?: string) => Promise<void>;
  addCustomProvider: (config: { id: string; name: string; baseURL: string; apiKey?: string }) => Promise<void>;
  updateProvider: (id: string, config: { apiKey?: string; baseURL?: string }) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  discoverModels: (providerId: string) => Promise<{ id: string; name: string }[]>;
  testProvider: (providerId: string) => Promise<{ success: boolean; latencyMs?: number; error?: string }>;
  updateRoutingRules: (rules: RoutingRule[]) => Promise<void>;
  setActiveModel: (modelId: string) => Promise<void>;
  upsertProfile: (profile: {
    provider: string;
    modelName: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
    limits?: { contextWindow: number; maxOutputTokens: number };
    cost?: { input: number; output: number };
  }) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  providers: [],
  providerPresets: [],
  routingRules: [],
  routingRulesCustom: false,
  activeModelId: null,
  activeModelProfile: null,
  modelProfiles: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [providersResult, presetsResult, rulesResult, activeResult, profilesResult] = await Promise.allSettled([
        getProviderConfigs(),
        listProviderPresets(),
        tauriGetRoutingRules(),
        getActiveModel(),
        listModelProfiles(),
      ]);

      const providersResp = providersResult.status === "fulfilled" ? providersResult.value : null;
      const presetsResp = presetsResult.status === "fulfilled" ? presetsResult.value : null;
      const rulesResp = rulesResult.status === "fulfilled" ? rulesResult.value : null;
      const activeResp = activeResult.status === "fulfilled" ? activeResult.value : null;
      const profilesResp = profilesResult.status === "fulfilled" ? profilesResult.value : null;

      const profiles = profilesResp?.profiles ?? [];
      let providers: ProviderEntry[] = [];

      if (providersResp) {
        if (Array.isArray((providersResp as Record<string, unknown>).providers)) {
          providers = ((providersResp as unknown as { providers: { id: string; name: string; type: string; baseURL: string; apiKey?: string; enabled: boolean }[] }).providers).map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            baseURL: p.baseURL,
            apiKey: p.apiKey ?? "",
            enabled: p.enabled,
            modelCount: profiles.filter((mp) => mp.provider === p.id).length,
          }));
        } else {
          const legacy = providersResp.providers as Record<string, ProviderCredentialView & { enabled?: boolean }>;
          providers = Object.entries(legacy).map(([id, p]) => ({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            type: "openai_compatible",
            baseURL: p.baseURL,
            apiKey: p.apiKey,
            enabled: p.enabled ?? true,
            modelCount: profiles.filter((mp) => mp.provider === id).length,
          }));
        }
      }

      const errors = [providersResult, presetsResult, rulesResult, activeResult, profilesResult]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason);

      set({
        providers,
        providerPresets: presetsResp?.presets ?? [],
        routingRules: rulesResp?.rules ?? [],
        routingRulesCustom: rulesResp?.isCustom ?? false,
        activeModelId: activeResp?.modelId ?? null,
        activeModelProfile: activeResp?.profile ?? null,
        modelProfiles: profiles,
        isLoading: false,
        error: errors.length > 0 ? errors.map(String).join("; ") : null,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addProvider: async (presetId, apiKey) => {
    set({ isLoading: true, error: null });
    try {
      const preset = get().providerPresets.find((p) => p.id === presetId);
      if (!preset) throw new Error(`Preset not found: ${presetId}`);

      await tauriAddProvider({
        id: preset.id,
        name: preset.name,
        type: preset.type,
        baseURL: preset.defaultBaseURL,
        apiKey,
        enabled: true,
      });
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addCustomProvider: async (config) => {
    set({ isLoading: true, error: null });
    try {
      await tauriAddProvider({
        id: config.id,
        name: config.name,
        type: "openai_compatible",
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        enabled: true,
      });
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateProvider: async (id, config) => {
    set({ isLoading: true, error: null });
    try {
      await tauriUpdateProvider(id, config);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  removeProvider: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await tauriRemoveProvider(id);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  discoverModels: async (providerId) => {
    try {
      const resp = await tauriDiscoverModels(providerId);
      return resp.models;
    } catch (e) {
      set({ error: String(e) });
      return [];
    }
  },

  testProvider: async (providerId) => {
    try {
      return await tauriTestProviderConnection(providerId);
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  updateRoutingRules: async (rules) => {
    set({ isLoading: true, error: null });
    try {
      await tauriUpdateRoutingRules(rules);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  setActiveModel: async (modelId) => {
    set({ isLoading: true, error: null });
    try {
      await tauriSetActiveModel(modelId);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  upsertProfile: async (profile) => {
    set({ isLoading: true, error: null });
    try {
      await tauriUpsertProfile(profile);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  deleteProfile: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await tauriDeleteProfile(id);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },
}));
