import { configManager } from "./config-manager.js";

export interface ProviderEnvSpec {
  apiKeyEnvs: string[];
  baseUrlEnvs?: string[];
  defaultBaseURL: string;
}

/**
 * Known provider environment variable mappings and standard base URLs.
 * Enables zero-config onboarding via standard CLI environment variables.
 */
export const PROVIDER_ENV_SPECS: Record<string, ProviderEnvSpec> = {
  deepseek: {
    apiKeyEnvs: ["DEEPSEEK_API_KEY"],
    baseUrlEnvs: ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_BASE"],
    defaultBaseURL: "https://api.deepseek.com/v1",
  },
  openai: {
    apiKeyEnvs: ["OPENAI_API_KEY"],
    baseUrlEnvs: ["OPENAI_BASE_URL", "OPENAI_API_BASE_URL"],
    defaultBaseURL: "https://api.openai.com/v1",
  },
  anthropic: {
    apiKeyEnvs: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    baseUrlEnvs: ["ANTHROPIC_BASE_URL"],
    defaultBaseURL: "https://api.anthropic.com/v1",
  },
  gemini: {
    apiKeyEnvs: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrlEnvs: ["GEMINI_BASE_URL"],
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  groq: {
    apiKeyEnvs: ["GROQ_API_KEY"],
    baseUrlEnvs: ["GROQ_BASE_URL"],
    defaultBaseURL: "https://api.groq.com/openai/v1",
  },
  openrouter: {
    apiKeyEnvs: ["OPENROUTER_API_KEY"],
    baseUrlEnvs: ["OPENROUTER_BASE_URL"],
    defaultBaseURL: "https://openrouter.ai/api/v1",
  },
  mimo: {
    apiKeyEnvs: ["MIMO_API_KEY", "XIAOMI_API_KEY"],
    baseUrlEnvs: ["MIMO_API_URL", "XIAOMI_API_URL"],
    defaultBaseURL: "https://token-plan-ams.xiaomimimo.com/v1",
  },
  qwen: {
    apiKeyEnvs: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    baseUrlEnvs: ["DASHSCOPE_BASE_URL"],
    defaultBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  ollama: {
    apiKeyEnvs: [],
    baseUrlEnvs: ["OLLAMA_BASE_URL", "OLLAMA_HOST"],
    defaultBaseURL: "http://localhost:11434/v1",
  },
};

export function probeEnvApiKey(providerId: string): string | undefined {
  const spec = PROVIDER_ENV_SPECS[providerId.toLowerCase()];
  if (!spec) return undefined;
  for (const envKey of spec.apiKeyEnvs) {
    const val = process.env[envKey]?.trim();
    if (val && val.length > 0) return val;
  }
  return undefined;
}

export function probeEnvBaseUrl(providerId: string): string | undefined {
  const spec = PROVIDER_ENV_SPECS[providerId.toLowerCase()];
  if (!spec?.baseUrlEnvs) return undefined;
  for (const envKey of spec.baseUrlEnvs) {
    const val = process.env[envKey]?.trim();
    if (val && val.length > 0) return val;
  }
  return undefined;
}

// Canonical legacy provider defaults — base URLs only, no env keys.
// API keys are resolved exclusively from ~/.jarvis/config/credentials.json.
export const LEGACY_DEFAULTS: Record<string, { baseURL: string }> = {
  mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1" },
  groq: { baseURL: "https://api.groq.com/openai/v1" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1" },
  local: { baseURL: "http://localhost:11434/v1" },
  ollama: { baseURL: "http://localhost:11434/v1" },
};

// Known hostname → provider mappings for auto-detection
const HOSTNAME_PROVIDER_MAP: Record<string, string> = {
  "api.groq.com": "groq",
  "openrouter.ai": "openrouter",
  "api.anthropic.com": "anthropic",
  "api.openai.com": "openai",
  "generativelanguage.googleapis.com": "gemini",
  "api.deepseek.com": "deepseek",
};

/**
 * Infer provider name from a URL hostname.
 * Returns null if the hostname is not recognized.
 */
export function inferProviderFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return HOSTNAME_PROVIDER_MAP[hostname] ?? null;
  } catch {
    return null;
  }
}

export interface ResolvedProvider {
  baseURL: string;
  apiKey: string;
}

export function resolveProvider(name: string): ResolvedProvider {
  const normalized = name.toLowerCase().trim();
  const spec = PROVIDER_ENV_SPECS[normalized];
  const envKey = probeEnvApiKey(normalized);
  const envBase = probeEnvBaseUrl(normalized);

  // 1. Check configManager (user-level storage: config.json + credentials.json)
  // Environment variables override static configuration when explicitly present.
  try {
    const configured = configManager.getProviderConfig(name);
    return {
      baseURL: envBase || configured.baseURL || spec?.defaultBaseURL || "",
      apiKey: envKey || configured.apiKey || "",
    };
  } catch {
    // Provider not in config, check environment and fallback specs
  }

  // 2. Check if environment variables provide keys or base URLs for this provider
  if (spec && (envKey || normalized === "ollama")) {
    return {
      baseURL: envBase || spec.defaultBaseURL,
      apiKey: envKey || "",
    };
  }

  // 3. Check legacy defaults (baseURL only — key must be in configManager or env)
  const legacy = LEGACY_DEFAULTS[name];
  if (legacy) {
    return {
      baseURL: envBase || legacy.baseURL,
      apiKey: envKey || "",
    };
  }

  // 4. Try hostname auto-detection — treat `name` as a potential URL
  const inferred = inferProviderFromUrl(name);
  if (inferred && inferred !== name) {
    return resolveProvider(inferred);
  }

  throw new Error(
    `Provider not configured: ${name}. Add it in Settings → Models or set ${spec?.apiKeyEnvs?.[0] ?? "API key"}.`,
  );
}
