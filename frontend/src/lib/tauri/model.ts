import { invoke } from '@tauri-apps/api/core';

export interface ModelProfile {
  id: string;
  provider: string;
  modelName: string;
  displayName: string;
  capabilities: {
    text: boolean;
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    audioInput: boolean;
    tts: boolean;
    jsonMode: boolean;
    longContext: boolean;
  };
  limits: { contextWindow: number; maxOutputTokens: number };
  cost: { input: number; output: number };
}

export async function listModelProfiles(): Promise<{ profiles: ModelProfile[] }> {
  return invoke('list_model_profiles');
}

export interface ProviderCredentialView {
  apiKey: string;
  baseURL: string;
}

export async function getProviderConfigs(): Promise<{
  providers: Record<string, ProviderCredentialView>;
}> {
  return invoke('get_provider_configs');
}

export async function updateProviderConfig(
  name: string,
  config: { apiKey?: string; baseURL?: string }
): Promise<{ success: boolean }> {
  return invoke('update_provider_config', { name, apiKey: config.apiKey, baseUrl: config.baseURL });
}

export interface ProviderPreset {
  id: string;
  name: string;
  nameCN: string;
  type: 'openai_compatible' | 'ollama';
  defaultBaseURL: string;
  requiresApiKey: boolean;
  popularModels: { id: string; name: string }[];
}

export interface StoredProvider {
  id: string;
  name: string;
  type: 'openai_compatible' | 'ollama';
  baseURL: string;
  apiKey?: string;
  enabled: boolean;
}

export async function listProviderPresets(): Promise<{ presets: ProviderPreset[] }> {
  return invoke('list_provider_presets');
}

export async function getProviders(): Promise<{
  providers: StoredProvider[] | Record<string, StoredProvider & { enabled: boolean }>;
  isLegacy: boolean;
}> {
  return invoke('get_provider_configs');
}

export async function addProvider(config: {
  id: string;
  name: string;
  type?: string;
  baseURL: string;
  apiKey?: string;
  enabled?: boolean;
}): Promise<{ success: boolean }> {
  return invoke('add_provider', { config });
}

export async function removeProvider(id: string): Promise<{ success: boolean }> {
  return invoke('remove_provider', { id });
}

export async function discoverModels(
  providerId: string
): Promise<{ models: { id: string; name: string }[] }> {
  return invoke('discover_models', { providerId });
}

export async function testProviderConnection(
  providerId: string
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  return invoke('test_provider_connection', { providerId });
}

export interface RoutingRule {
  taskType: string;
  modelId: string;
  conditions?: Record<string, unknown>;
}

export async function getRoutingRules(): Promise<{ rules: RoutingRule[]; isCustom: boolean }> {
  return invoke('get_routing_rules');
}

export async function updateRoutingRules(rules: RoutingRule[]): Promise<{ success: boolean }> {
  return invoke('update_routing_rules', { rules });
}

export async function getActiveModel(): Promise<{ modelId: string; profile: ModelProfile | null }> {
  return invoke('get_active_model');
}

export async function setActiveModel(modelId: string): Promise<{ success: boolean }> {
  return invoke('set_active_model', { modelId });
}

export interface TickConfig {
  enabled: boolean;
  intervalMinutes: number;
  modelId?: string;
  providerId?: string;
}

export async function getTickConfig(): Promise<TickConfig> {
  return invoke('get_tick_config');
}

export async function updateTickConfig(
  config: Partial<TickConfig>
): Promise<{ success: boolean; config: TickConfig }> {
  return invoke('update_tick_config', { config });
}

export async function upsertModelProfile(profile: {
  provider: string;
  modelName: string;
  displayName?: string;
  capabilities?: Record<string, boolean>;
  limits?: { contextWindow: number; maxOutputTokens: number };
  cost?: { input: number; output: number };
}): Promise<{ success: boolean; profile: ModelProfile }> {
  return invoke('upsert_model_profile', { profile });
}

export async function deleteModelProfile(id: string): Promise<{ success: boolean }> {
  return invoke('delete_model_profile', { id });
}
