import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { env } from "./env.js";
import { resolveAppPaths } from "./app-paths.js";

const appPaths = resolveAppPaths();
const CONFIG_DIR = appPaths.configDir;
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface DbConfigCredentials {
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  postgresUrl?: string;
}

interface Config {
  storageMode: "local" | "cloud" | "postgres";
  dbConfig?: DbConfigCredentials;
}

function readConfig(): Config {
  const defaults: Config = { storageMode: "local" };

  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.storageMode === "local" || parsed.storageMode === "cloud" || parsed.storageMode === "postgres") {
        defaults.storageMode = parsed.storageMode;
      }
      if (parsed.dbConfig && typeof parsed.dbConfig === "object") {
        defaults.dbConfig = parsed.dbConfig;
      }
    }
  } catch {
    // Ignore parse errors, fall back to defaults
  }

  // Fall back to environment variable for storageMode
  if (!existsSync(CONFIG_FILE)) {
    const envMode = env.STORAGE_MODE;
    if (envMode === "cloud") {
      defaults.storageMode = "cloud";
    }
  }

  return defaults;
}

function mergeConfig(partial: Partial<Config>): void {
  const current = readConfig();
  const merged = { ...current, ...partial };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

export function getStorageMode(): "local" | "cloud" | "postgres" {
  return readConfig().storageMode;
}

export function setStorageMode(mode: "local" | "cloud" | "postgres"): void {
  mergeConfig({ storageMode: mode });
}

export function isCloudConfigured(): boolean {
  const dbConfig = readConfig().dbConfig;
  return Boolean(dbConfig?.supabaseUrl && dbConfig?.supabaseServiceKey);
}

export function isPostgresConfigured(): boolean {
  const dbConfig = readConfig().dbConfig;
  return Boolean(env.DATABASE_URL || dbConfig?.postgresUrl);
}

export function getDbConfig(): DbConfigCredentials {
  return readConfig().dbConfig ?? {};
}

export function setDbConfig(config: DbConfigCredentials): void {
  mergeConfig({ dbConfig: config });
}
