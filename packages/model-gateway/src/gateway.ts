import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  ModelGatewayConfig,
  ModelProfile,
  ModelProviderName,
  ModelRoutingRule,
  ProviderConfig,
} from '@jarvis/types';
import { DEFAULT_PROFILES, DEFAULT_ROUTING_RULES } from './profiles.js';
import { selectModelForTask } from './router.js';

export class ModelGateway {
  private config: ModelGatewayConfig;
  private profiles: Map<string, ModelProfile> = new Map();

  constructor(config: {
    defaultModelId?: string;
    routingRules?: ModelRoutingRule[];
    providers: Record<ModelProviderName, ProviderConfig>;
    profiles?: ModelProfile[];
  }) {
    this.config = {
      defaultModelId: config.defaultModelId ?? 'mimo-2.5-pro',
      routingRules: config.routingRules ?? DEFAULT_ROUTING_RULES,
      providers: config.providers,
    };

    const allProfiles = config.profiles ?? DEFAULT_PROFILES;
    for (const profile of allProfiles) {
      this.profiles.set(profile.id, profile);
    }
  }

  getProfile(modelId: string): ModelProfile | undefined {
    return this.profiles.get(modelId);
  }

  getAllProfiles(): ModelProfile[] {
    return Array.from(this.profiles.values());
  }

  getModel(modelId?: string): LanguageModelV3 {
    const id = modelId ?? this.config.defaultModelId;
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`Model profile not found: ${id}`);
    }

    const providerConfig = this.config.providers[profile.provider];
    if (!providerConfig) {
      throw new Error(`Provider not configured: ${profile.provider}`);
    }

    const provider = createOpenAI({
      baseURL: providerConfig.baseURL,
      apiKey: providerConfig.apiKey,
    });

    return provider.chat(profile.modelName);
  }

  selectModel(taskContext: {
    mode?: 'text' | 'voice';
    expectedAnswerLength?: 'short' | 'medium' | 'long';
    requiresToolCalling?: boolean;
    requiresLongContext?: boolean;
    requiresPrivacy?: boolean;
    requiresVision?: boolean;
  }): string {
    return selectModelForTask(taskContext, this.config.routingRules, this.config.defaultModelId);
  }

  resolveModel(taskContext: {
    mode?: 'text' | 'voice';
    expectedAnswerLength?: 'short' | 'medium' | 'long';
    requiresToolCalling?: boolean;
    requiresLongContext?: boolean;
    requiresPrivacy?: boolean;
    requiresVision?: boolean;
  }): LanguageModelV3 {
    const modelId = this.selectModel(taskContext);
    return this.getModel(modelId);
  }

  updateRoutingRules(rules: ModelRoutingRule[]): void {
    this.config.routingRules = rules;
  }

  updateDefaultModel(modelId: string): void {
    if (!this.profiles.has(modelId)) {
      throw new Error(`Model profile not found: ${modelId}`);
    }
    this.config.defaultModelId = modelId;
  }
}
