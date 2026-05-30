import { Hono } from "hono";
import {
  getRoutingRules,
  setRoutingRules,
  getActiveModelId,
  setActiveModelId,
} from "../config/storage-config.js";
import { getRepositories } from "../db/factory.js";
import { resetGateway, getModelGateway } from "../model/gateway.js";
import { DEFAULT_ROUTING_RULES } from "@jarvis/model-gateway";
import { apiError, logError } from "../utils/errors.js";

const app = new Hono();

// ---- Routing Rules ----

app.get("/routing-rules", (c) => {
  try {
    const custom = getRoutingRules();
    return c.json({
      rules: custom ?? DEFAULT_ROUTING_RULES,
      isCustom: custom !== undefined,
    });
  } catch (err) {
    logError("settings/routing-rules/get", err);
    return apiError(c, "Failed to get routing rules", 500);
  }
});

app.put("/routing-rules", async (c) => {
  try {
    const body = await c.req.json<{ rules: { taskType: string; modelId: string; conditions?: Record<string, unknown> }[] }>();

    if (!Array.isArray(body.rules)) {
      return apiError(c, "rules must be an array", 400);
    }

    for (const rule of body.rules) {
      if (!rule.taskType || !rule.modelId) {
        return apiError(c, "Each rule must have taskType and modelId", 400);
      }
    }

    setRoutingRules(body.rules);
    resetGateway();

    return c.json({ success: true, message: "Routing rules updated." });
  } catch (err) {
    logError("settings/routing-rules/update", err);
    return apiError(c, "Failed to update routing rules", 500);
  }
});

// ---- Active Model ----

app.get("/active-model", (c) => {
  try {
    const activeId = getActiveModelId();
    const gateway = getModelGateway();
    const profile = activeId ? gateway.getProfile(activeId) : null;

    return c.json({
      modelId: activeId ?? "mimo-2.5-pro",
      profile: profile ?? null,
    });
  } catch (err) {
    logError("settings/active-model/get", err);
    return apiError(c, "Failed to get active model", 500);
  }
});

app.put("/active-model", async (c) => {
  try {
    const body = await c.req.json<{ modelId: string }>();

    if (!body.modelId) {
      return apiError(c, "modelId is required", 400);
    }

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

    setActiveModelId(body.modelId);
    resetGateway();

    return c.json({ success: true, message: `Active model set to "${body.modelId}".` });
  } catch (err) {
    logError("settings/active-model/update", err);
    return apiError(c, "Failed to set active model", 500);
  }
});

// ---- Model Profiles ----

app.get("/model-profiles", (c) => {
  try {
    const gateway = getModelGateway();
    return c.json({ profiles: gateway.getAllProfiles() });
  } catch (err) {
    logError("settings/model-profiles/list", err);
    return apiError(c, "Failed to list model profiles", 500);
  }
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
    return apiError(c, "provider and modelName are required", 400);
  }

  try {
    const repos = getRepositories();
    const result = await (repos.modelProfiles as { upsert: (input: unknown) => Promise<unknown> }).upsert(body);
    resetGateway();
    return c.json({ success: true, profile: result });
  } catch (e) {
    logError("settings/model-profiles/upsert", e);
    return apiError(c, `保存模型配置失败: ${String(e)}`, 500);
  }
});

app.delete("/model-profiles/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const repos = getRepositories();
    const deleted = await repos.modelProfiles.delete(id);

    if (!deleted) {
      return apiError(c, "Profile not found", 404);
    }

    resetGateway();
    return c.json({ success: true });
  } catch (err) {
    logError("settings/model-profiles/delete", err);
    return apiError(c, "Failed to delete model profile", 500);
  }
});

export default app;
