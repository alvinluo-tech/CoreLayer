import { Hono } from "hono";
import { configManager } from "../../config/config-manager.js";
import { getRepositories } from "../../persistence/factory.js";
import { resetGateway, getModelGateway } from "../../gateways/model/gateway.js";
import { DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";
import { apiError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

const VIRTUAL_AUTO_PROFILE = {
  id: "auto",
  provider: "system",
  modelName: "auto",
  displayName: "Auto (智能路由)",
  capabilities: {
    text: true,
    streaming: true,
    toolCalling: true,
    vision: true,
    audioInput: true,
    tts: true,
    jsonMode: true,
    longContext: true,
  },
  limits: { contextWindow: 1000000, maxOutputTokens: 8192 },
  cost: { input: 0, output: 0 },
};


// ---- Routing Rules ----

app.get("/routing-rules", withErrorHandling("settings/routing-rules/get", (c) => {
  const custom = configManager.getRoutingRules();
  return c.json({
    rules: custom.length > 0 ? custom : DEFAULT_ROUTING_RULES,
    isCustom: custom.length > 0,
  });
}));

app.put("/routing-rules", withErrorHandling("settings/routing-rules/update", async (c) => {
  const body = await c.req.json<{ rules: { taskType: string; modelId: string; conditions?: Record<string, unknown> }[] }>();

  if (!Array.isArray(body.rules)) {
    return apiError(c, "rules must be an array", 400);
  }

  for (const rule of body.rules) {
    if (!rule.taskType || !rule.modelId) {
      return apiError(c, "Each rule must have taskType and modelId", 400);
    }
  }

  configManager.setRoutingRules(body.rules);
  resetGateway();

  return c.json({ success: true, message: "Routing rules updated." });
}));

// ---- Active Model ----

app.get("/active-model", withErrorHandling("settings/active-model/get", (c) => {
  const activeId = configManager.getActiveModel();
  const gateway = getModelGateway();
  const profile = activeId === "auto" ? VIRTUAL_AUTO_PROFILE : gateway.getProfile(activeId);

  return c.json({
    modelId: activeId,
    profile: profile ?? null,
  });
}));

app.put("/active-model", withErrorHandling("settings/active-model/update", async (c) => {
  const body = await c.req.json<{ modelId: string }>();

  if (!body.modelId) {
    return apiError(c, "modelId is required", 400);
  }

  if (body.modelId !== "auto") {
    const gateway = getModelGateway();
    const profile = gateway.getProfile(body.modelId);
    if (!profile) {
      const repos = getRepositories();
      const dbProfiles = await repos.modelProfiles.getAll();
      const found = dbProfiles.find((p) => p.id === body.modelId);
      if (!found) {
        return apiError(c, `Model profile not found: ${body.modelId}`, 400);
      }
    }
  }

  configManager.setActiveModel(body.modelId);
  resetGateway();

  return c.json({ success: true, message: `Active model set to "${body.modelId}".` });
}));

// ---- Model Profiles ----

app.get("/model-profiles", withErrorHandling("settings/model-profiles/list", (c) => {
  const gateway = getModelGateway();
  const profiles = [VIRTUAL_AUTO_PROFILE, ...gateway.getAllProfiles()];
  return c.json({ profiles });
}));

app.post("/model-profiles", withErrorHandling("settings/model-profiles/upsert", async (c) => {
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
    return apiError(c, "provider and modelName are required", 400);
  }

  const repos = getRepositories();
  const result = await (repos.modelProfiles as { upsert: (input: unknown) => Promise<unknown> }).upsert(body);
  resetGateway();
  return c.json({ success: true, profile: result });
}));

app.delete("/model-profiles/:id", withErrorHandling("settings/model-profiles/delete", async (c) => {
  const id = c.req.param("id")!;
  const repos = getRepositories();
  const deleted = await repos.modelProfiles.delete(id);

  if (!deleted) {
    return apiError(c, "Profile not found", 404);
  }

  resetGateway();
  return c.json({ success: true });
}));

export default app;
