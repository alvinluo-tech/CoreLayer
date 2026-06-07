import { readFileSync, existsSync, renameSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { configManager, type StoredProvider, type RoutingRule } from "./config-manager.js";

interface LegacyProvider {
  id: string;
  name: string;
  type?: string;
  baseURL: string;
  apiKey?: string;
  enabled?: boolean;
}

interface LegacyConfig {
  storageMode?: string;
  providerCredentials?: Record<string, { apiKey?: string; baseURL?: string }>;
  providers?: LegacyProvider[];
  routingRules?: RoutingRule[];
  activeModelId?: string;
}

const ENV_KEY_MAP: Record<string, string> = {
  MIMO_API_KEY: "mimo",
  XIAOMI_API_KEY: "mimo",
  GROQ_API_KEY: "groq",
  OPENROUTER_API_KEY: "openrouter",
};

export function runMigration(): void {
  // Step 0: Move legacy files from ~/.jarvis/ to ~/.jarvis/config/
  migrateConfigDir();

  const config = configManager.getConfig();
  if (config.migrated) return;

  let migrated = false;

  // 1. Migrate from daemon/data/config.json
  const oldConfigPath = join(process.cwd(), "data", "config.json");
  if (existsSync(oldConfigPath)) {
    try {
      const raw = JSON.parse(readFileSync(oldConfigPath, "utf-8")) as LegacyConfig;

      // Migrate providers
      if (raw.providers && raw.providers.length > 0) {
        for (const p of raw.providers) {
          configManager.setProvider(p.id, {
            name: p.name,
            type: (p.type as StoredProvider["type"]) ?? "openai_compatible",
            baseURL: p.baseURL,
            enabled: p.enabled ?? true,
          });
          // Migrate API key if present in stored provider
          if (p.apiKey) {
            configManager.setCredential(p.id, p.apiKey);
          }
        }
        migrated = true;
      }

      // Migrate legacy providerCredentials
      if (raw.providerCredentials) {
        for (const [name, cred] of Object.entries(raw.providerCredentials)) {
          if (cred.apiKey) {
            configManager.setCredential(name, cred.apiKey);
            migrated = true;
          }
        }
      }

      // Migrate routing rules
      if (raw.routingRules && raw.routingRules.length > 0) {
        configManager.setRoutingRules(raw.routingRules);
        migrated = true;
      }

      // Migrate active model
      if (raw.activeModelId) {
        configManager.setActiveModel(raw.activeModelId);
        migrated = true;
      }
    } catch {
      // Ignore parse errors from old config
    }
  }

  // 2. Migrate API keys from .env
  for (const [envKey, providerId] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envKey];
    if (value) {
      const creds = configManager.getCredentials();
      if (!creds[providerId]) {
        configManager.setCredential(providerId, value);
        migrated = true;
      }
    }
  }

  // Mark migration complete
  if (migrated) {
    configManager.updateConfig({ migrated: true });
  }
}

/**
 * Move config files from legacy ~/.jarvis/ root to ~/.jarvis/config/.
 * One-time migration — only runs if old files exist at root level.
 */
function migrateConfigDir(): void {
  const jarvisHome = join(homedir(), ".jarvis");
  const configDir = join(jarvisHome, "config");
  mkdirSync(configDir, { recursive: true });

  const filesToMigrate = ["config.json", "credentials.json", "mcp-servers.json"];
  for (const file of filesToMigrate) {
    const oldPath = join(jarvisHome, file);
    const newPath = join(configDir, file);
    if (existsSync(oldPath) && !existsSync(newPath)) {
      try {
        renameSync(oldPath, newPath);
      } catch {
        // Ignore — file may be locked by another process
      }
    }
  }
}
