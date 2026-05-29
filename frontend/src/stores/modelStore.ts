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
  type ModelProfile,
  type ProviderCredentialView,
  type RoutingRule,
} from "@/lib/tauri";

interface ModelState {
  providerConfigs: Record<string, ProviderCredentialView>;
  routingRules: RoutingRule[];
  routingRulesCustom: boolean;
  activeModelId: string | null;
  activeModelProfile: ModelProfile | null;
  modelProfiles: ModelProfile[];
  isLoading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  updateProvider: (name: string, config: { apiKey?: string; baseURL?: string }) => Promise<void>;
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
  providerConfigs: {},
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
      const [providersResp, rulesResp, activeResp, profilesResp] = await Promise.all([
        getProviderConfigs(),
        tauriGetRoutingRules(),
        getActiveModel(),
        listModelProfiles(),
      ]);
      set({
        providerConfigs: providersResp.providers,
        routingRules: rulesResp.rules,
        routingRulesCustom: rulesResp.isCustom,
        activeModelId: activeResp.modelId,
        activeModelProfile: activeResp.profile,
        modelProfiles: profilesResp.profiles,
        isLoading: false,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateProvider: async (name, config) => {
    set({ isLoading: true, error: null });
    try {
      await tauriUpdateProvider(name, config);
      await get().fetchAll();
    } catch (e) {
      set({ error: String(e), isLoading: false });
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
