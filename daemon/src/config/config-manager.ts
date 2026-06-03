import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---- Types ----

export interface StoredProvider {
  id: string;
  name: string;
  type: "openai_compatible" | "ollama";
  baseURL: string;
  enabled: boolean;
}

export interface RoutingRule {
  taskType: string;
  modelId: string;
  conditions?: Record<string, unknown>;
}

export interface JarvisConfig {
  version: 1;
  activeProvider: string;
  activeModel: string;
  providers: StoredProvider[];
  routingRules: RoutingRule[];
  defaults: {
    temperature: number;
    maxTokens: number;
    maxSteps: number;
    streamTimeout: number;
  };
  migrated?: boolean;
}

export type Credentials = Record<string, string>;

// ---- Config directory ----

function getConfigDir(): string {
  return process.env.JARVIS_HOME || join(homedir(), ".jarvis");
}

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

function getCredentialsPath(): string {
  return join(getConfigDir(), "credentials.json");
}

// ---- Defaults ----

const DEFAULT_CONFIG: JarvisConfig = {
  version: 1,
  activeProvider: "mimo",
  activeModel: "mimo-v2.5-pro",
  providers: [
    {
      id: "mimo",
      name: "MiMo",
      type: "openai_compatible",
      baseURL: "https://token-plan-ams.xiaomimimo.com/v1",
      enabled: true,
    },
    {
      id: "groq",
      name: "Groq",
      type: "openai_compatible",
      baseURL: "https://api.groq.com/openai/v1",
      enabled: true,
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      type: "openai_compatible",
      baseURL: "https://openrouter.ai/api/v1",
      enabled: true,
    },
    {
      id: "ollama",
      name: "Ollama",
      type: "ollama",
      baseURL: "http://localhost:11434/v1",
      enabled: true,
    },
  ],
  routingRules: [
    { taskType: "fast", modelId: "groq-llama", conditions: { expectedAnswerLength: "short" } },
    { taskType: "toolAgent", modelId: "mimo-2.5-pro", conditions: { requiresToolCalling: true } },
    { taskType: "reasoning", modelId: "mimo-2.5-pro", conditions: { requiresLongContext: true } },
    { taskType: "private", modelId: "local-ollama", conditions: { requiresPrivacy: true } },
    { taskType: "chat", modelId: "mimo-2.5-pro" },
  ],
  defaults: {
    temperature: 0.7,
    maxTokens: 4096,
    maxSteps: 20,
    streamTimeout: 120_000,
  },
};

// ---- File I/O ----

function ensureDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8")) as T;
    }
  } catch {
    // Ignore parse errors
  }
  return fallback;
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir();
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ---- ConfigManager ----

class ConfigManager {
  getConfig(): JarvisConfig {
    return readJsonFile(getConfigPath(), DEFAULT_CONFIG);
  }

  updateConfig(partial: Partial<JarvisConfig>): void {
    const current = this.getConfig();
    const merged = { ...current, ...partial };
    writeJsonFile(getConfigPath(), merged);
  }

  getCredentials(): Credentials {
    return readJsonFile(getCredentialsPath(), {});
  }

  setCredential(providerId: string, apiKey: string): void {
    const creds = this.getCredentials();
    creds[providerId] = apiKey;
    writeJsonFile(getCredentialsPath(), creds);
  }

  removeCredential(providerId: string): void {
    const creds = this.getCredentials();
    delete creds[providerId];
    writeJsonFile(getCredentialsPath(), creds);
  }

  getProviderConfig(providerId: string): { baseURL: string; apiKey: string } {
    const config = this.getConfig();
    const creds = this.getCredentials();

    const provider = config.providers.find((p) => p.id === providerId);
    if (provider) {
      return {
        baseURL: provider.baseURL,
        apiKey: creds[providerId] ?? "",
      };
    }

    throw new Error(
      `Provider not configured: ${providerId}. Add it in Settings → Models.`,
    );
  }

  getActiveProvider(): string {
    return this.getConfig().activeProvider;
  }

  getActiveModel(): string {
    return this.getConfig().activeModel;
  }

  setActiveProvider(providerId: string): void {
    this.updateConfig({ activeProvider: providerId });
  }

  setActiveModel(modelId: string): void {
    this.updateConfig({ activeModel: modelId });
  }

  getProviders(): StoredProvider[] {
    return this.getConfig().providers;
  }

  setProvider(id: string, provider: Omit<StoredProvider, "id">): void {
    const config = this.getConfig();
    const providers = [...config.providers];
    const index = providers.findIndex((p) => p.id === id);
    const entry: StoredProvider = { id, ...provider };
    if (index >= 0) {
      providers[index] = entry;
    } else {
      providers.push(entry);
    }
    this.updateConfig({ providers });
  }

  removeProvider(id: string): void {
    const config = this.getConfig();
    const providers = config.providers.filter((p) => p.id !== id);
    this.updateConfig({ providers });
    this.removeCredential(id);
  }

  getRoutingRules(): RoutingRule[] {
    return this.getConfig().routingRules;
  }

  getMaxSteps(): number {
    return this.getConfig().defaults.maxSteps ?? 20;
  }

  getStreamTimeout(): number {
    return this.getConfig().defaults.streamTimeout ?? 120_000;
  }

  setRoutingRules(rules: RoutingRule[]): void {
    this.updateConfig({ routingRules: rules });
  }
}

export const configManager = new ConfigManager();
