import { Hono } from "hono";
import {
  setStorageMode,
  isCloudConfigured,
  getProviderCredentials,
  setProviderCredential,
  getRoutingRules,
  setRoutingRules,
  getActiveModelId,
  setActiveModelId,
} from "../config/storage-config.js";
import { switchStorageMode, getCurrentMode } from "../db/factory.js";
import { getRepositories } from "../db/factory.js";
import { resetGateway, getModelGateway } from "../model/gateway.js";
import { DEFAULT_PROFILES, DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";

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

// ---- Provider Credentials ----

function maskApiKey(key: string | undefined): string {
  if (!key || key === "ollama" || key.length <= 4) return key ?? "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

function isMaskedKey(key: string): boolean {
  return /^\*{4,}/.test(key);
}

app.get("/providers", (c) => {
  const creds = getProviderCredentials();
  const providers: Record<string, { apiKey: string; baseURL: string }> = {};

  // Always show all 4 providers, merging UI config with defaults
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

app.put("/providers/:name", async (c) => {
  const name = c.req.param("name");
  if (!["mimo", "groq", "openrouter", "local"].includes(name)) {
    return c.json({ error: "Invalid provider name" }, 400);
  }

  const body = await c.req.json<{ apiKey?: string; baseURL?: string }>();
  const cred: { apiKey?: string; baseURL?: string } = {};

  // Only update apiKey if it's not a masked value
  if (body.apiKey !== undefined && !isMaskedKey(body.apiKey)) {
    cred.apiKey = body.apiKey;
  }
  if (body.baseURL !== undefined) {
    cred.baseURL = body.baseURL;
  }

  setProviderCredential(name, cred);
  resetGateway();

  return c.json({ success: true, message: `Provider "${name}" updated.` });
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
    // Also check DB profiles
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
