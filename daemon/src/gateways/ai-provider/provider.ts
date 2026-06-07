import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { configManager } from "../../config/config-manager.js";
import { resolveProvider } from "../../config/provider-resolver.js";
import { DEFAULT_PROFILES } from "@jarvis/model-gateway";
import { deadHostManager } from "./dead-host.js";
import { logError } from "../../utils/errors.js";

interface ProviderConfig {
  baseURL: string;
  apiKey: string;
}

export function getProviderConfig(name: string): ProviderConfig {
  return resolveProvider(name);
}

export function getProvider(name?: string) {
  const providerName = name ?? configManager.getActiveProvider();
  const config = getProviderConfig(providerName);
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}

/**
 * Resolve a profile ID (e.g. "mimo-2.5-pro") to the actual API model name (e.g. "mimo-v2.5-pro").
 * Falls back to the input if no profile matches.
 */
function resolveModelName(profileId: string): string {
  const profile = DEFAULT_PROFILES.find((p) => p.id === profileId);
  return profile?.modelName ?? profileId;
}

// ---- Model-specific adaptations ----

/** Reasoning model families that need special handling. */
const REASONING_MODEL_PATTERN = /\b(o[1-9]|o[1-9]-mini|o[1-9]-preview)\b/i;
const ANTHROPIC_MODEL_PATTERN = /\b(claude|anthropic)\b/i;

function isReasoningModel(modelId: string): boolean {
  return REASONING_MODEL_PATTERN.test(modelId);
}

function isAnthropicModel(modelId: string): boolean {
  return ANTHROPIC_MODEL_PATTERN.test(modelId);
}

/**
 * Adapt call parameters based on model family.
 * - Reasoning models: set maxOutputTokens, omit temperature
 * - Anthropic models: clamp temperature to [0, 1]
 */
function adaptParams(modelId: string, params: LanguageModelV3CallOptions): LanguageModelV3CallOptions {
  let adapted = { ...params };

  if (isReasoningModel(modelId)) {
    // Reasoning models require max_completion_tokens (mapped via maxOutputTokens)
    // and do not support temperature
    if (!adapted.maxOutputTokens) {
      adapted.maxOutputTokens = 16384;
    }
    const { temperature: _, ...rest } = adapted;
    adapted = rest;
  }

  if (isAnthropicModel(modelId) && adapted.temperature !== undefined) {
    adapted = { ...adapted, temperature: Math.max(0, Math.min(1, adapted.temperature)) };
  }

  return adapted;
}

/**
 * Wrap a LanguageModelV3 with model-specific parameter adaptations.
 * Transparent to callers — the returned model behaves identically.
 */
function wrapModelWithAdaptations(model: LanguageModelV3): LanguageModelV3 {
  const modelId = model.modelId;
  return {
    ...model,
    doGenerate: (params: LanguageModelV3CallOptions) => model.doGenerate(adaptParams(modelId, params)),
    doStream: (params: LanguageModelV3CallOptions) => model.doStream(adaptParams(modelId, params)),
  };
}

// ---- Fallback chains ----

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/** Sleep for a given number of milliseconds. Exported for test mocking. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Errors that are safe to retry (network / server errors). */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Network timeouts
    if (msg.includes("timeout") || msg.includes("etimedout") || msg.includes("econnrefused")) return true;
    if (msg.includes("econnreset") || msg.includes("socket hang up")) return true;
  }
  // Check for HTTP status codes in error objects
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode;
  if (typeof status === "number") {
    return status >= 500 || status === 429; // server errors + rate limit
  }
  return false;
}

/** Get ordered list of provider names to try: active first, then other enabled providers. */
function getProviderChain(): string[] {
  const active = configManager.getActiveProvider();
  const allProviders = configManager.getProviders().filter((p) => p.enabled).map((p) => p.id);
  // Active first, then the rest (deduplicated)
  const chain = [active];
  for (const p of allProviders) {
    if (p !== active) chain.push(p);
  }
  return chain;
}

/**
 * Try providers in order, falling back on retryable errors.
 * Returns a LanguageModelV3 from the first provider that succeeds at model-creation time.
 * Actual API errors are caught during generate/stream, not here.
 */
export function getModel(providerName?: string, modelName?: string): LanguageModelV3 {
  const modelId = modelName ?? configManager.getActiveModel();
  const resolvedModelName = resolveModelName(modelId);

  if (providerName) {
    // Explicit provider — no fallback
    const provider = getProvider(providerName);
    return wrapModelWithAdaptations(provider.chat(resolvedModelName));
  }

  // Auto-select with fallback awareness
  const chain = getProviderChain();
  for (const name of chain) {
    if (deadHostManager.isDead(name)) continue;
    try {
      const provider = getProvider(name);
      return wrapModelWithAdaptations(provider.chat(resolvedModelName));
    } catch (err) {
      logError("getModel/createProvider", err);
      if (!isRetryableError(err)) throw err;
      deadHostManager.recordFailure(name);
    }
  }

  // All providers dead or failed — try active as last resort (even if dead)
  const fallbackProvider = getProvider(chain[0]);
  return wrapModelWithAdaptations(fallbackProvider.chat(resolvedModelName));
}

/**
 * Wrap a generate/stream call with fallback logic.
 * If the primary provider fails with a retryable error, tries the next provider in chain.
 */
export async function callWithFallback<T>(
  fn: (providerName: string) => Promise<T>,
): Promise<T> {
  const chain = getProviderChain();
  let lastError: unknown;

  for (const name of chain) {
    if (deadHostManager.isDead(name)) continue;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await fn(name);
        deadHostManager.recordSuccess(name);
        return result;
      } catch (err) {
        lastError = err;
        if (!isRetryableError(err)) throw err;

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logError(`[Provider Retry] attempt ${attempt}/${MAX_RETRIES} for "${name}", waiting ${delay}ms...`, err);
          await sleep(delay);
        } else {
          logError(`[Provider Retry] exhausted ${MAX_RETRIES} attempts for "${name}", falling back`, err);
          deadHostManager.recordFailure(name);
        }
      }
    }
  }

  // All providers failed — throw the last error
  throw lastError;
}

export function getProviderName(): string {
  return configManager.getActiveProvider();
}
