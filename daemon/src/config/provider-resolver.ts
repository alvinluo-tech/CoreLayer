import { configManager } from "./config-manager.js";

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
  // 1. Check configManager (user-level ~/.jarvis/config/*.json)
  try {
    return configManager.getProviderConfig(name);
  } catch {
    // Provider not in config, fall through to legacy defaults
  }

  // 2. Check legacy defaults (baseURL only — key must be in configManager)
  const legacy = LEGACY_DEFAULTS[name];
  if (legacy) {
    return {
      baseURL: legacy.baseURL,
      apiKey: "",
    };
  }

  // 3. Try hostname auto-detection — treat `name` as a potential URL
  const inferred = inferProviderFromUrl(name);
  if (inferred && inferred !== name) {
    return resolveProvider(inferred);
  }

  throw new Error(
    `Provider not configured: ${name}. Add it in Settings → Models.`,
  );
}
