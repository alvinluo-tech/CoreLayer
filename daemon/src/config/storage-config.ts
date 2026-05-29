import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { env } from "./env.js";

const CONFIG_DIR = join(process.cwd(), "data");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface ProviderCredential {
  apiKey?: string;
  baseURL?: string;
}

interface RoutingRule {
  taskType: string;
  modelId: string;
  conditions?: Record<string, unknown>;
}

export interface StoredProvider {
  id: string;
  name: string;
  type: "openai_compatible" | "ollama";
  baseURL: string;
  apiKey?: string;
  enabled: boolean;
}

interface Config {
  storageMode: "local" | "cloud";
  providerCredentials?: Record<string, ProviderCredential>;
  providers?: StoredProvider[];
  routingRules?: RoutingRule[];
  activeModelId?: string;
}

function readConfig(): Config {
  const defaults: Config = { storageMode: "local" };

  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Lenient parsing: accept any valid fields, don't reject on missing storageMode
      if (parsed.storageMode === "local" || parsed.storageMode === "cloud") {
        defaults.storageMode = parsed.storageMode;
      }
      if (parsed.providerCredentials && typeof parsed.providerCredentials === "object") {
        defaults.providerCredentials = parsed.providerCredentials;
      }
      if (Array.isArray(parsed.providers)) {
        defaults.providers = parsed.providers;
      }
      if (Array.isArray(parsed.routingRules)) {
        defaults.routingRules = parsed.routingRules;
      }
      if (typeof parsed.activeModelId === "string") {
        defaults.activeModelId = parsed.activeModelId;
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

export function getStorageMode(): "local" | "cloud" {
  return readConfig().storageMode;
}

export function setStorageMode(mode: "local" | "cloud"): void {
  mergeConfig({ storageMode: mode });
}

export function isCloudConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// ---- Provider Credentials (legacy, backward compat) ----

export function getProviderCredentials(): Record<string, ProviderCredential> {
  return readConfig().providerCredentials ?? {};
}

export function setProviderCredential(name: string, cred: ProviderCredential): void {
  const current = getProviderCredentials();
  const existing = current[name] ?? {};
  current[name] = {
    apiKey: cred.apiKey !== undefined ? cred.apiKey : existing.apiKey,
    baseURL: cred.baseURL !== undefined ? cred.baseURL : existing.baseURL,
  };
  mergeConfig({ providerCredentials: current });
}

// ---- Providers (new dynamic system) ----

export function getProviders(): StoredProvider[] {
  return readConfig().providers ?? [];
}

export function setProvider(id: string, provider: Omit<StoredProvider, "id">): void {
  const providers = getProviders();
  const index = providers.findIndex((p) => p.id === id);
  const entry: StoredProvider = { id, ...provider };
  if (index >= 0) {
    providers[index] = entry;
  } else {
    providers.push(entry);
  }
  mergeConfig({ providers });
}

export function removeProvider(id: string): void {
  const providers = getProviders().filter((p) => p.id !== id);
  mergeConfig({ providers });
}

// ---- Routing Rules ----

export function getRoutingRules(): RoutingRule[] | undefined {
  return readConfig().routingRules;
}

export function setRoutingRules(rules: RoutingRule[]): void {
  mergeConfig({ routingRules: rules });
}

// ---- Active Model ----

export function getActiveModelId(): string | undefined {
  return readConfig().activeModelId;
}

export function setActiveModelId(id: string): void {
  mergeConfig({ activeModelId: id });
}
