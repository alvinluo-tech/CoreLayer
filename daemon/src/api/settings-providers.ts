import { Hono } from "hono";
import {
  getProviderCredentials,
  setProviderCredential,
  getProviders,
  setProvider,
  removeProvider,
  type StoredProvider,
} from "../config/storage-config.js";
import { resetGateway } from "../model/gateway.js";
import { PROVIDER_PRESETS } from "@jarvis/model-gateway";
import { apiError, logError } from "../utils/errors.js";
import { maskApiKey, isMaskedKey } from "./settings-helpers.js";

const app = new Hono();

// ---- Provider Presets ----

app.get("/providers/presets", (c) => {
  return c.json({ presets: PROVIDER_PRESETS });
});

// ---- Providers CRUD ----

app.get("/providers", (c) => {
  try {
    const stored = getProviders();
    const creds = getProviderCredentials();

    if (stored.length === 0) {
      const providers: Record<string, { apiKey: string; baseURL: string; enabled: boolean }> = {};
      const defaults: Record<string, { baseURL: string }> = {
        mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1" },
        groq: { baseURL: "https://api.groq.com/openai/v1" },
        openrouter: { baseURL: "https://openrouter.ai/api/v1" },
        local: { baseURL: "http://localhost:11434/v1" },
      };

      for (const [name, def] of Object.entries(defaults)) {
        const ui = creds[name];
        providers[name] = {
          apiKey: maskApiKey(ui?.apiKey),
          baseURL: ui?.baseURL ?? def.baseURL,
          enabled: true,
        };
      }

      return c.json({ providers, isLegacy: true });
    }

    const providers = stored.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }));

    return c.json({ providers, isLegacy: false });
  } catch (err) {
    logError("settings/providers/list", err);
    return apiError(c, "Failed to list providers", 500);
  }
});

app.post("/providers", async (c) => {
  try {
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
      apiKey: body.apiKey,
      enabled: body.enabled ?? true,
    };

    setProvider(body.id, provider);
    resetGateway();

    return c.json({ success: true, message: `Provider "${body.name}" added.` });
  } catch (err) {
    logError("settings/providers/create", err);
    return apiError(c, `Failed to add provider: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

app.put("/providers/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{
      name?: string;
      baseURL?: string;
      apiKey?: string;
      enabled?: boolean;
    }>();

    const existing = getProviders().find((p) => p.id === id);
    if (existing) {
      const updated: Omit<StoredProvider, "id"> = {
        name: body.name ?? existing.name,
        type: existing.type,
        baseURL: body.baseURL ?? existing.baseURL,
        apiKey: body.apiKey !== undefined && !isMaskedKey(body.apiKey) ? body.apiKey : existing.apiKey,
        enabled: body.enabled ?? existing.enabled,
      };
      setProvider(id, updated);
    } else {
      const cred: { apiKey?: string; baseURL?: string } = {};
      if (body.apiKey !== undefined && !isMaskedKey(body.apiKey)) {
        cred.apiKey = body.apiKey;
      }
      if (body.baseURL !== undefined) {
        cred.baseURL = body.baseURL;
      }
      setProviderCredential(id, cred);
    }

    resetGateway();
    return c.json({ success: true, message: `Provider "${id}" updated.` });
  } catch (err) {
    logError("settings/providers/update", err);
    return apiError(c, `Failed to update provider: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});

app.delete("/providers/:id", async (c) => {
  try {
    const id = c.req.param("id");
    removeProvider(id);
    resetGateway();
    return c.json({ success: true });
  } catch (err) {
    logError("settings/providers/delete", err);
    return apiError(c, "Failed to delete provider", 500);
  }
});

// ---- Model Discovery ----

app.post("/providers/:id/discover", async (c) => {
  const id = c.req.param("id");
  const stored = getProviders().find((p) => p.id === id);

  let baseURL: string;
  let apiKey: string;

  if (stored) {
    baseURL = stored.baseURL;
    apiKey = stored.apiKey ?? "";
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
  const id = c.req.param("id");
  const stored = getProviders().find((p) => p.id === id);

  if (!stored) {
    return apiError(c, `Provider "${id}" not found.`, 404);
  }

  const startTime = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (stored.apiKey && stored.apiKey !== "ollama" && !isMaskedKey(stored.apiKey)) {
      headers["Authorization"] = `Bearer ${stored.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(`${stored.baseURL}/models`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (resp.status === 401 || resp.status === 403) {
      return c.json({ success: false, error: "API Key 校验失败 (401 Unauthorized)", latencyMs });
    }

    if (!resp.ok) {
      return c.json({ success: false, error: `服务器返回异常: ${resp.status} ${resp.statusText}`, latencyMs });
    }

    return c.json({ success: true, latencyMs });
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    logError("settings/providers/test", e);
    return c.json({ success: false, error: `连接超时或 URL 错误: ${String(e)}`, latencyMs });
  }
});

// ---- Legacy Provider Credentials (backward compat) ----

app.get("/providers/legacy", (c) => {
  const creds = getProviderCredentials();
  const providers: Record<string, { apiKey: string; baseURL: string }> = {};

  const defaults: Record<string, { baseURL: string }> = {
    mimo: { baseURL: "https://token-plan-ams.xiaomimimo.com/v1" },
    groq: { baseURL: "https://api.groq.com/openai/v1" },
    openrouter: { baseURL: "https://openrouter.ai/api/v1" },
    local: { baseURL: "http://localhost:11434/v1" },
  };

  for (const [name, def] of Object.entries(defaults)) {
    const ui = creds[name];
    providers[name] = {
      apiKey: maskApiKey(ui?.apiKey),
      baseURL: ui?.baseURL ?? def.baseURL,
    };
  }

  return c.json({ providers });
});

export default app;
