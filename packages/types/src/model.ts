export type ModelProviderName = string;

export type ModelCapability =
  | 'text'
  | 'streaming'
  | 'toolCalling'
  | 'vision'
  | 'audioInput'
  | 'tts'
  | 'jsonMode'
  | 'longContext';

export type ModelTaskType =
  | 'chat'
  | 'fast'
  | 'reasoning'
  | 'toolAgent'
  | 'coding'
  | 'voice'
  | 'private';

export interface ModelCapabilities {
  text: boolean;
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  audioInput: boolean;
  tts: boolean;
  jsonMode: boolean;
  longContext: boolean;
}

export interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ModelCost {
  input: number;
  output: number;
}

export interface CapabilityRequirements {
  required: ModelCapability[];
  bonus?: ModelCapability[];
  minContextWindow?: number;
}

export interface ModelScore {
  modelId: string;
  score: number;
  matchedRequired: ModelCapability[];
  matchedBonus: ModelCapability[];
}

export interface ModelProfile {
  id: string;
  provider: ModelProviderName;
  modelName: string;
  displayName: string;
  capabilities: ModelCapabilities;
  limits: ModelLimits;
  cost: ModelCost;
}

export interface ModelRoutingRule {
  taskType: ModelTaskType;
  modelId: string;
  conditions?: {
    expectedAnswerLength?: 'short' | 'medium' | 'long';
    requiresToolCalling?: boolean;
    requiresLongContext?: boolean;
    requiresPrivacy?: boolean;
    requiresVision?: boolean;
  };
}

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  models: ModelProfile[];
}

export interface ModelGatewayConfig {
  defaultModelId: string;
  routingRules: ModelRoutingRule[];
  providers: Record<ModelProviderName, ProviderConfig>;
}
