import { Hono } from "hono";
import { configManager, type StoredProvider } from "../../config/config-manager.js";
import { LEGACY_DEFAULTS } from "../../config/provider-resolver.js";
import { resetGateway } from "../../gateways/model/gateway.js";
import { PROVIDER_PRESETS } from "@jarvis/model-gateway";
import { apiError, logError } from "../../shared/errors.js";
import { maskApiKey, isMaskedKey } from "./settings-helpers.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

// ---- Provider Presets ----

app.get("/providers/presets", withErrorHandling("settings/providers/presets", (c) => {
  return c.json({ presets: PROVIDER_PRESETS });
}));

// ---- Providers CRUD ----

app.get("/providers", withErrorHandling("settings/providers/list", (c) => {
  const stored = configManager.getProviders();

  if (stored.length === 0) {
    // Synthesize legacy view from credentials
    const creds = configManager.getCredentials();
    const providers: Record<string, { apiKey: string; baseURL: string; enabled: boolean }> = {};

    for (const [name, def] of Object.entries(LEGACY_DEFAULTS)) {
      if (name === "ollama") continue; // Skip alias
      providers[name] = {
        apiKey: maskApiKey(creds[name]),
        baseURL: def.baseURL,
        enabled: true,
      };
    }

    return c.json({ providers, isLegacy: true });
  }

  const providers = stored.map((p) => ({
    ...p,
    apiKey: maskApiKey(configManager.getCredentials()[p.id]),
  }));

  return c.json({ providers, isLegacy: false });
}));

app.post("/providers", withErrorHandling("settings/providers/create", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    type?: string;
    baseURL: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  if (!body.id || !body.name || !body.baseURL) {
    return apiError(c, "id, name, and baseURL are required", 400);
  }

  const provider: Omit<StoredProvider, "id"> = {
    name: body.name,
    type: (body.type as StoredProvider["type"]) ?? "openai_compatible",
    baseURL: body.baseURL,
    enabled: body.enabled ?? true,
  };

  configManager.setProvider(body.id, provider);

  if (body.apiKey) {
    configManager.setCredential(body.id, body.apiKey);
  }

  resetGateway();

  return c.json({ success: true, message: `Provider "${body.name}" added.` });
}));

app.put("/providers/:id", withErrorHandling("settings/providers/update", async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json<{
    name?: string;
    baseURL?: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  const existing = configManager.getProviders().find((p) => p.id === id);
  if (existing) {
    const updated: Omit<StoredProvider, "id"> = {
      name: body.name ?? existing.name,
      type: existing.type,
      baseURL: body.baseURL ?? existing.baseURL,
      enabled: body.enabled ?? existing.enabled,
    };
    configManager.setProvider(id, updated);

    // Update credential separately
    if (body.apiKey !== undefined && !isMaskedKey(body.apiKey)) {
      configManager.setCredential(id, body.apiKey);
    }
  } else {
    // Legacy provider — create as new stored provider using preset defaults
    const preset = PROVIDER_PRESETS.find((p) => p.id === id);
    if (preset) {
      const provider: Omit<StoredProvider, "id"> = {
        name: preset.name,
        type: preset.type as StoredProvider["type"],
        baseURL: body.baseURL ?? preset.defaultBaseURL,
        enabled: body.enabled ?? true,
      };
      configManager.setProvider(id, provider);
    }

    if (body.apiKey !== undefined && !isMaskedKey(body.apiKey)) {
      configManager.setCredential(id, body.apiKey);
    }
  }

  resetGateway();
  return c.json({ success: true, message: `Provider "${id}" updated.` });
}));

app.delete("/providers/:id", withErrorHandling("settings/providers/delete", async (c) => {
  const id = c.req.param("id")!;
  configManager.removeProvider(id);
  resetGateway();
  return c.json({ success: true });
}));

// ---- Model Discovery ----

app.post("/providers/:id/discover", async (c) => {
  const id = c.req.param("id")!;
  const stored = configManager.getProviders().find((p) => p.id === id);

  let baseURL: string;
  let apiKey: string;

  if (stored) {
    baseURL = stored.baseURL;
    apiKey = configManager.getCredentials()[id] ?? "";
  } else {
    return apiError(c, `Provider "${id}" not found. Add it first.`, 404);
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "ollama") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(`${baseURL}/models`, { headers });

    if (!resp.ok) {
      return apiError(c, `Failed to fetch models: ${resp.status} ${resp.statusText}`, 502);
    }

    const data = await resp.json() as { data?: { id: string; name?: string }[] };
    const models = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    }));

    return c.json({ models });
  } catch (e) {
    logError("settings/providers/discover", e);
    return apiError(c, `Connection failed: ${String(e)}`, 502);
  }
});

// ---- Provider Connectivity Test ----

app.post("/providers/:id/test", async (c) => {
  const id = c.req.param("id")!;
  const stored = configManager.getProviders().find((p) => p.id === id);

  if (!stored) {
    return apiError(c, `Provider "${id}" not found.`, 404);
  }

  const startTime = Date.now();
  try {
    const apiKey = configManager.getCredentials()[id] ?? "";
    const keyConfigured = Boolean(apiKey && apiKey !== "ollama" && !isMaskedKey(apiKey));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (keyConfigured) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Some providers (e.g. OpenRouter) have public /models endpoints that
    // return 200 even without a valid key. For those, hit an auth-requiring
    // endpoint to actually verify the key.
    let testURL = `${stored.baseURL}/models`;
    if (keyConfigured && stored.baseURL.includes("openrouter.ai")) {
      const origin = new URL(stored.baseURL).origin;
      testURL = `${origin}/api/v1/auth/key`;
    }

    const resp = await fetch(testURL, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (resp.status === 401 || resp.status === 403) {
      return c.json({
        success: false,
        error: keyConfigured
          ? "API Key 无效 (401 Unauthorized)"
          : "需要配置 API Key 才能使用此供应商",
        latencyMs,
        keyConfigured,
      });
    }

    if (!resp.ok) {
      return c.json({
        success: false,
        error: `服务器返回异常: ${resp.status} ${resp.statusText}`,
        latencyMs,
        keyConfigured,
      });
    }

    return c.json({ success: true, latencyMs, keyConfigured });
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    logError("settings/providers/test", e);
    return c.json({ success: false, error: `连接超时或 URL 错误: ${String(e)}`, latencyMs });
  }
});

// ---- Legacy Provider Credentials (backward compat) ----

app.get("/providers/legacy", withErrorHandling("settings/providers/legacy", (c) => {
  const creds = configManager.getCredentials();
  const providers: Record<string, { apiKey: string; baseURL: string }> = {};

  for (const [name, def] of Object.entries(LEGACY_DEFAULTS)) {
    if (name === "ollama") continue;
    providers[name] = {
      apiKey: maskApiKey(creds[name]),
      baseURL: def.baseURL,
    };
  }

  return c.json({ providers });
}));

export default app;
