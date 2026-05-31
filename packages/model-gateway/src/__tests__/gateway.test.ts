import { describe, it, expect, vi } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = vi.fn((modelId: string) => ({ modelId }));
    provider.chat = vi.fn((modelName: string) => ({ modelId: modelName }));
    return provider;
  }),
}));

import { ModelGateway } from '../gateway.js';
import type { ModelProfile, ModelRoutingRule, ProviderConfig } from '@jarvis/types';

const testProfile: ModelProfile = {
  id: 'test-model',
  provider: 'openai',
  modelName: 'gpt-4',
  displayName: 'Test Model',
  capabilities: {
    text: true,
    streaming: true,
    toolCalling: true,
    vision: false,
    audioInput: false,
    tts: false,
    jsonMode: true,
    longContext: false,
  },
  limits: { contextWindow: 128000, maxOutputTokens: 4096 },
  cost: { input: 5, output: 15 },
};

const testProfile2: ModelProfile = {
  id: 'test-model-2',
  provider: 'groq',
  modelName: 'llama-3.3-70b',
  displayName: 'Test Model 2',
  capabilities: {
    text: true,
    streaming: true,
    toolCalling: false,
    vision: false,
    audioInput: false,
    tts: false,
    jsonMode: true,
    longContext: false,
  },
  limits: { contextWindow: 128000, maxOutputTokens: 4096 },
  cost: { input: 0, output: 0 },
};

const providers: Record<string, ProviderConfig> = {
  openai: { baseURL: 'https://api.openai.com/v1', apiKey: 'sk-test', models: [] },
  groq: { baseURL: 'https://api.groq.com/v1', apiKey: 'gsk-test', models: [] },
};

const defaultRoutingRules: ModelRoutingRule[] = [
  { taskType: 'fast', modelId: 'test-model-2', conditions: { expectedAnswerLength: 'short' } },
  { taskType: 'chat', modelId: 'test-model' },
];

describe('ModelGateway', () => {
  describe('constructor', () => {
    it('uses default modelId when not provided', () => {
      const gateway = new ModelGateway({
        providers,
        profiles: [testProfile],
      });
      // Default modelId is "mimo-2.5-pro", but getModel will throw because
      // the profile doesn't exist in our custom profiles
      expect(() => gateway.getModel()).toThrow('Model profile not found: mimo-2.5-pro');
    });

    it('uses provided defaultModelId', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });
      const model = gateway.getModel();
      expect(model.modelId).toBe('gpt-4');
    });

    it('uses default routing rules when not provided', () => {
      const gateway = new ModelGateway({
        providers,
        profiles: [testProfile],
      });
      // Should not throw
      const modelId = gateway.selectModel({ requiresToolCalling: true });
      expect(typeof modelId).toBe('string');
    });

    it('uses provided routing rules', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        routingRules: defaultRoutingRules,
        providers,
        profiles: [testProfile, testProfile2],
      });

      const modelId = gateway.selectModel({ expectedAnswerLength: 'short' });
      expect(modelId).toBe('test-model-2');
    });
  });

  describe('getProfile()', () => {
    it('returns profile for valid modelId', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      const profile = gateway.getProfile('test-model');
      expect(profile).toBeDefined();
      expect(profile!.id).toBe('test-model');
      expect(profile!.displayName).toBe('Test Model');
    });

    it('returns undefined for unknown modelId', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      expect(gateway.getProfile('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllProfiles()', () => {
    it('returns all registered profiles', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile, testProfile2],
      });

      const profiles = gateway.getAllProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.id)).toContain('test-model');
      expect(profiles.map((p) => p.id)).toContain('test-model-2');
    });

    it('returns empty array when no custom profiles and no defaults match', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [],
      });

      expect(gateway.getAllProfiles()).toEqual([]);
    });
  });

  describe('getModel()', () => {
    it('returns a model for valid modelId', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      const model = gateway.getModel('test-model');
      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4');
    });

    it('uses defaultModelId when no modelId provided', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      const model = gateway.getModel();
      expect(model.modelId).toBe('gpt-4');
    });

    it('throws for invalid modelId', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      expect(() => gateway.getModel('nonexistent')).toThrow('Model profile not found: nonexistent');
    });

    it('throws when provider is not configured', () => {
      const noProviders: Record<string, ProviderConfig> = {};
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers: noProviders,
        profiles: [testProfile],
      });

      expect(() => gateway.getModel('test-model')).toThrow('Provider not configured: openai');
    });
  });

  describe('updateRoutingRules()', () => {
    it('replaces routing rules', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        routingRules: [],
        providers,
        profiles: [testProfile, testProfile2],
      });

      // Initially no rules, so selectModel returns default
      expect(gateway.selectModel({ expectedAnswerLength: 'short' })).toBe('test-model');

      gateway.updateRoutingRules(defaultRoutingRules);

      // Now the rule should match
      expect(gateway.selectModel({ expectedAnswerLength: 'short' })).toBe('test-model-2');
    });
  });

  describe('updateDefaultModel()', () => {
    it('updates the default model', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile, testProfile2],
      });

      expect(gateway.getModel().modelId).toBe('gpt-4');

      gateway.updateDefaultModel('test-model-2');
      expect(gateway.getModel().modelId).toBe('llama-3.3-70b');
    });

    it('throws when updating to nonexistent model', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        providers,
        profiles: [testProfile],
      });

      expect(() => gateway.updateDefaultModel('nonexistent')).toThrow(
        'Model profile not found: nonexistent'
      );
    });
  });

  describe('selectModel()', () => {
    it('routes to fast model for short voice answers', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        routingRules: defaultRoutingRules,
        providers,
        profiles: [testProfile, testProfile2],
      });

      const modelId = gateway.selectModel({ mode: 'voice', expectedAnswerLength: 'short' });
      expect(modelId).toBe('test-model-2');
    });

    it('falls back to default model when no rules match', () => {
      const gateway = new ModelGateway({
        defaultModelId: 'test-model',
        routingRules: [
          {
            taskType: 'fast',
            modelId: 'test-model-2',
            conditions: { expectedAnswerLength: 'short' },
          },
        ],
        providers,
        profiles: [testProfile, testProfile2],
      });

      const modelId = gateway.selectModel({ requiresVision: true });
      expect(modelId).toBe('test-model');
    });
  });
});
