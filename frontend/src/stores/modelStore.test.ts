import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetProviderConfigs = vi.fn();
const mockUpdateProviderConfig = vi.fn();
const mockGetRoutingRules = vi.fn();
const mockUpdateRoutingRules = vi.fn();
const mockGetActiveModel = vi.fn();
const mockSetActiveModel = vi.fn();
const mockListModelProfiles = vi.fn();
const mockUpsertModelProfile = vi.fn();
const mockDeleteModelProfile = vi.fn();
const mockListProviderPresets = vi.fn();
const mockAddProvider = vi.fn();
const mockRemoveProvider = vi.fn();
const mockDiscoverModels = vi.fn();
const mockTestProviderConnection = vi.fn();

vi.mock('@/lib/tauri', () => ({
  getProviderConfigs: (...args: unknown[]) => mockGetProviderConfigs(...args),
  updateProviderConfig: (...args: unknown[]) => mockUpdateProviderConfig(...args),
  getRoutingRules: (...args: unknown[]) => mockGetRoutingRules(...args),
  updateRoutingRules: (...args: unknown[]) => mockUpdateRoutingRules(...args),
  getActiveModel: (...args: unknown[]) => mockGetActiveModel(...args),
  setActiveModel: (...args: unknown[]) => mockSetActiveModel(...args),
  listModelProfiles: (...args: unknown[]) => mockListModelProfiles(...args),
  upsertModelProfile: (...args: unknown[]) => mockUpsertModelProfile(...args),
  deleteModelProfile: (...args: unknown[]) => mockDeleteModelProfile(...args),
  listProviderPresets: (...args: unknown[]) => mockListProviderPresets(...args),
  addProvider: (...args: unknown[]) => mockAddProvider(...args),
  removeProvider: (...args: unknown[]) => mockRemoveProvider(...args),
  discoverModels: (...args: unknown[]) => mockDiscoverModels(...args),
  testProviderConnection: (...args: unknown[]) => mockTestProviderConnection(...args),
}));

import { useModelStore } from './modelStore';

beforeEach(() => {
  vi.clearAllMocks();
  useModelStore.setState({
    providers: [],
    providerPresets: [],
    routingRules: [],
    routingRulesCustom: false,
    activeModelId: null,
    activeModelProfile: null,
    modelProfiles: [],
    isLoading: false,
    error: null,
  });
});

describe('useModelStore', () => {
  describe('fetchAll', () => {
    it('populates all data when all calls succeed', async () => {
      mockGetProviderConfigs.mockResolvedValueOnce({
        providers: { openai: { apiKey: 'sk-***', baseURL: 'https://api.openai.com/v1' } },
      });
      mockListProviderPresets.mockResolvedValueOnce({
        presets: [
          {
            id: 'openai',
            name: 'OpenAI',
            nameCN: '',
            type: 'openai_compatible',
            defaultBaseURL: 'https://api.openai.com/v1',
            requiresApiKey: true,
            popularModels: [],
          },
        ],
      });
      mockGetRoutingRules.mockResolvedValueOnce({ rules: [], isCustom: false });
      mockGetActiveModel.mockResolvedValueOnce({ modelId: null, profile: null });
      mockListModelProfiles.mockResolvedValueOnce({ profiles: [] });

      await useModelStore.getState().fetchAll();

      const state = useModelStore.getState();
      expect(state.providers).toHaveLength(1);
      expect(state.providers[0]!.id).toBe('openai');
      expect(state.providerPresets).toHaveLength(1);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('handles partial failure gracefully (Promise.allSettled)', async () => {
      mockGetProviderConfigs.mockRejectedValueOnce(new Error('providers down'));
      mockListProviderPresets.mockResolvedValueOnce({ presets: [] });
      mockGetRoutingRules.mockResolvedValueOnce({ rules: [], isCustom: false });
      mockGetActiveModel.mockResolvedValueOnce({ modelId: null, profile: null });
      mockListModelProfiles.mockResolvedValueOnce({ profiles: [] });

      await useModelStore.getState().fetchAll();

      const state = useModelStore.getState();
      expect(state.providers).toEqual([]);
      expect(state.providerPresets).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain('providers down');
    });

    it('handles array-format providers response', async () => {
      mockGetProviderConfigs.mockResolvedValueOnce({
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            type: 'openai_compatible',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-***',
            enabled: true,
          },
        ],
      });
      mockListProviderPresets.mockResolvedValueOnce({ presets: [] });
      mockGetRoutingRules.mockResolvedValueOnce({ rules: [], isCustom: false });
      mockGetActiveModel.mockResolvedValueOnce({ modelId: null, profile: null });
      mockListModelProfiles.mockResolvedValueOnce({ profiles: [] });

      await useModelStore.getState().fetchAll();

      const state = useModelStore.getState();
      expect(state.providers).toHaveLength(1);
      expect(state.providers[0]!.name).toBe('OpenAI');
    });
  });

  describe('addProvider', () => {
    it('throws if preset not found', async () => {
      useModelStore.setState({ providerPresets: [] });

      await useModelStore.getState().addProvider('nonexistent');

      const state = useModelStore.getState();
      expect(state.error).toContain('Preset not found');
    });

    it('calls addProvider and refreshes on success', async () => {
      const preset = {
        id: 'openai',
        name: 'OpenAI',
        nameCN: '',
        type: 'openai_compatible' as const,
        defaultBaseURL: 'https://api.openai.com/v1',
        requiresApiKey: true,
        popularModels: [],
      };
      useModelStore.setState({ providerPresets: [preset] });

      // addProvider -> tauriAddProvider
      mockAddProvider.mockResolvedValueOnce({ success: true });
      // fetchAll calls inside addProvider
      mockGetProviderConfigs.mockResolvedValueOnce({
        providers: { openai: { apiKey: 'sk-***', baseURL: 'https://api.openai.com/v1' } },
      });
      mockListProviderPresets.mockResolvedValueOnce({ presets: [preset] });
      mockGetRoutingRules.mockResolvedValueOnce({ rules: [], isCustom: false });
      mockGetActiveModel.mockResolvedValueOnce({ modelId: null, profile: null });
      mockListModelProfiles.mockResolvedValueOnce({ profiles: [] });

      await useModelStore.getState().addProvider('openai', 'sk-test');

      expect(mockAddProvider).toHaveBeenCalledWith({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai_compatible',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        enabled: true,
      });
    });
  });
});
