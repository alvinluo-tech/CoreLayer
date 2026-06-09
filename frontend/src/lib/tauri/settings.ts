import { invoke } from '@tauri-apps/api/core';

export async function getSettings(): Promise<{
  storageMode: string;
  availableModes: string[];
  cloudConfigured: boolean;
}> {
  return invoke('get_settings');
}

export async function updateStorageMode(mode: string): Promise<{
  storageMode: string;
  message: string;
}> {
  return invoke('update_storage_mode', { mode });
}

export interface DbStats {
  success: boolean;
  dbSize: string;
  entryCount: {
    conversations: number;
    tasks: number;
    articles: number;
  };
}

export async function getDbStats(): Promise<DbStats> {
  return invoke('get_db_stats');
}

export interface ModelUsageSummary {
  modelId: string;
  displayName: string;
  conversationCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface UsageStats {
  totalConversations: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  models: ModelUsageSummary[];
}

export async function getUsageStats(): Promise<UsageStats> {
  return invoke('get_usage_stats');
}

export interface DbTableInfo {
  id: string;
  name: string;
  description: string;
  count: number;
}

export async function dbManagerListTables(): Promise<{ success: boolean; tables: DbTableInfo[] }> {
  return invoke('db_manager_list_tables');
}

export async function dbManagerGetTableRows(
  tableName: string
): Promise<{ success: boolean; rows: Record<string, unknown>[] }> {
  return invoke('db_manager_get_table_rows', { tableName });
}

export async function dbManagerDeleteRow(
  tableName: string,
  id: string
): Promise<{ success: boolean; deleted: boolean }> {
  return invoke('db_manager_delete_row', { tableName, id });
}

export async function dbManagerClearTable(
  tableName: string
): Promise<{ success: boolean; message: string }> {
  return invoke('db_manager_clear_table', { tableName });
}

export interface DbConfig {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  postgresUrl?: string;
}

export async function dbConfigGet(): Promise<DbConfig> {
  return invoke('db_config_get');
}

export async function dbConfigSet(
  config: DbConfig
): Promise<{ success: boolean; message: string }> {
  return invoke('db_config_set', { config });
}

export async function dbConfigTest(testParams: {
  type: 'supabase' | 'postgres';
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  postgresUrl?: string;
}): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  return invoke('db_config_test', { testParams });
}

export async function dbConfigMigrate(): Promise<{ success: boolean; message: string }> {
  return invoke('db_config_migrate');
}
