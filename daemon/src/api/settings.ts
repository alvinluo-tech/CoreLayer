import { Hono } from "hono";
import {
  setStorageMode,
  isCloudConfigured,
  getProviderCredentials,
  setProviderCredential,
  getProviders,
  setProvider,
  removeProvider,
  getRoutingRules,
  setRoutingRules,
  getActiveModelId,
  setActiveModelId,
  type StoredProvider,
} from "../config/storage-config.js";
import { switchStorageMode, getCurrentMode } from "../db/factory.js";
import { getRepositories } from "../db/factory.js";
import { resetGateway, getModelGateway } from "../model/gateway.js";
import { DEFAULT_PROFILES, DEFAULT_ROUTING_RULES, PROVIDER_PRESETS } from "@jarvis/model-gateway";

const app = new Hono();

// ---- Storage Mode ----

app.get("/", (c) => {
  return c.json({
    storageMode: getCurrentMode(),
    availableModes: ["local", "cloud"],
    cloudConfigured: isCloudConfigured(),
  });
});

app.put("/storage-mode", async (c) => {
  const body = await c.req.json<{ mode: string }>();

  if (body.mode !== "local" && body.mode !== "cloud") {
    return c.json({ error: "Invalid mode. Must be 'local' or 'cloud'." }, 400);
  }

  if (body.mode === "cloud" && !isCloudConfigured()) {
    return c.json({
      error: "Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured.",
    }, 400);
  }

  setStorageMode(body.mode);
  await switchStorageMode(body.mode);

  return c.json({
    storageMode: body.mode,
    message: `Storage mode switched to ${body.mode}.`,
  });
});

// ---- Provider Helpers ----

function maskApiKey(key: string | undefined): string {
  if (!key || key === "ollama" || key.length <= 4) return key ?? "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

function isMaskedKey(key: string): boolean {
  return /^\*{4,}/.test(key);
}

// ---- Provider Presets ----

app.get("/providers/presets", (c) => {
  return c.json({ presets: PROVIDER_PRESETS });
});

// ---- Providers CRUD ----

app.get("/providers", (c) => {
  const stored = getProviders();
  const creds = getProviderCredentials();

  // If no stored providers, return legacy format for backward compat
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

  // New format: return stored providers with masked keys
  const providers = stored.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }));

  return c.json({ providers, isLegacy: false });
});

app.post("/providers", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    type?: string;
    baseURL: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  if (!body.id || !body.name || !body.baseURL) {
    return c.json({ error: "id, name, and baseURL are required" }, 400);
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
});

app.put("/providers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    baseURL?: string;
    apiKey?: string;
    enabled?: boolean;
  }>();

  const existing = getProviders().find((p) => p.id === id);
  if (existing) {
    // Update stored provider
    const updated: Omit<StoredProvider, "id"> = {
      name: body.name ?? existing.name,
      type: existing.type,
      baseURL: body.baseURL ?? existing.baseURL,
      apiKey: body.apiKey !== undefined && !isMaskedKey(body.apiKey) ? body.apiKey : existing.apiKey,
      enabled: body.enabled ?? existing.enabled,
    };
    setProvider(id, updated);
  } else {
    // Legacy: update via providerCredentials
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
});

app.delete("/providers/:id", async (c) => {
  const id = c.req.param("id");
  removeProvider(id);
  resetGateway();
  return c.json({ success: true });
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
    return c.json({ error: `Provider "${id}" not found. Add it first.` }, 404);
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "ollama") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(`${baseURL}/models`, { headers });

    if (!resp.ok) {
      return c.json({
        error: `Failed to fetch models: ${resp.status} ${resp.statusText}`,
      }, 502);
    }

    const data = await resp.json() as { data?: { id: string; name?: string }[] };
    const models = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    }));

    return c.json({ models });
  } catch (e) {
    return c.json({ error: `Connection failed: ${String(e)}` }, 502);
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

// ---- Routing Rules ----

app.get("/routing-rules", (c) => {
  const custom = getRoutingRules();
  return c.json({
    rules: custom ?? DEFAULT_ROUTING_RULES,
    isCustom: custom !== undefined,
  });
});

app.put("/routing-rules", async (c) => {
  const body = await c.req.json<{ rules: { taskType: string; modelId: string; conditions?: Record<string, unknown> }[] }>();

  if (!Array.isArray(body.rules)) {
    return c.json({ error: "rules must be an array" }, 400);
  }

  for (const rule of body.rules) {
    if (!rule.taskType || !rule.modelId) {
      return c.json({ error: "Each rule must have taskType and modelId" }, 400);
    }
  }

  setRoutingRules(body.rules);
  resetGateway();

  return c.json({ success: true, message: "Routing rules updated." });
});

// ---- Active Model ----

app.get("/active-model", (c) => {
  const activeId = getActiveModelId();
  const gateway = getModelGateway();
  const profile = activeId ? gateway.getProfile(activeId) : null;

  return c.json({
    modelId: activeId ?? "mimo-2.5-pro",
    profile: profile ?? null,
  });
});

app.put("/active-model", async (c) => {
  const body = await c.req.json<{ modelId: string }>();

  if (!body.modelId) {
    return c.json({ error: "modelId is required" }, 400);
  }

  // Validate the model exists in profiles
  const gateway = getModelGateway();
  const profile = gateway.getProfile(body.modelId);
  if (!profile) {
    const repos = getRepositories();
    const dbProfiles = (repos.modelProfiles as { getAll: () => unknown[] }).getAll();
    const found = dbProfiles.find((p: unknown) => (p as { id: string }).id === body.modelId);
    if (!found) {
      return c.json({ error: `Model profile not found: ${body.modelId}` }, 400);
    }
  }

  setActiveModelId(body.modelId);
  resetGateway();

  return c.json({ success: true, message: `Active model set to "${body.modelId}".` });
});

// ---- Model Profiles ----

app.get("/model-profiles", (c) => {
  const gateway = getModelGateway();
  return c.json({ profiles: gateway.getAllProfiles() });
});

app.post("/model-profiles", async (c) => {
  const body = await c.req.json<{
    provider: string;
    modelName: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
    limits?: { contextWindow: number; maxOutputTokens: number };
    cost?: { input: number; output: number };
    isDefault?: boolean;
  }>();

  if (!body.provider || !body.modelName) {
    return c.json({ error: "provider and modelName are required" }, 400);
  }

  const repos = getRepositories();
  const result = (repos.modelProfiles as { upsert: (input: unknown) => unknown }).upsert(body);
  resetGateway();

  return c.json({ success: true, profile: result });
});

app.delete("/model-profiles/:id", async (c) => {
  const id = c.req.param("id");
  const repos = getRepositories();
  const deleted = (repos.modelProfiles as { delete: (id: string) => boolean }).delete(id);

  if (!deleted) {
    return c.json({ error: "Profile not found" }, 404);
  }

  resetGateway();
  return c.json({ success: true });
});

export default app;
