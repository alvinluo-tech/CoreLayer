import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import {
  isAgentModelPolicy,
  isAgentExecutorPolicy,
} from "../../shared/agent-profile-types.js";
import type { CreateAgentProfileInput, UpdateAgentProfileData } from "../../persistence/repository.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const agentProfileRoutes = new Hono();

function validateCreateInput(body: unknown): { ok: true; input: CreateAgentProfileInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required" };
  }
  const b = body as Record<string, unknown>;
  if (!b.name || typeof b.name !== "string") {
    return { ok: false, error: "name is required and must be a string" };
  }
  if (b.skills !== undefined && !Array.isArray(b.skills)) {
    return { ok: false, error: "skills must be an array" };
  }
  if (b.tools !== undefined && !Array.isArray(b.tools)) {
    return { ok: false, error: "tools must be an array" };
  }
  if (b.knowledgeScopes !== undefined && !Array.isArray(b.knowledgeScopes)) {
    return { ok: false, error: "knowledgeScopes must be an array" };
  }
  if (b.permissions !== undefined && !Array.isArray(b.permissions)) {
    return { ok: false, error: "permissions must be an array" };
  }
  if (b.memoryScopes !== undefined && !Array.isArray(b.memoryScopes)) {
    return { ok: false, error: "memoryScopes must be an array" };
  }
  if (b.modelPolicy !== undefined && b.modelPolicy !== null && !isAgentModelPolicy(b.modelPolicy)) {
    return { ok: false, error: "modelPolicy must have preferredModels (string[]), fallbackModel (string), maxTokens (number), temperature (number), or provider (string)" };
  }
  if (b.executorPolicy !== undefined && b.executorPolicy !== null && !isAgentExecutorPolicy(b.executorPolicy)) {
    return { ok: false, error: "executorPolicy must have executor (one of: self, codex, claude-code, opencode)" };
  }
  return {
    ok: true,
    input: {
      name: b.name as string,
      description: typeof b.description === "string" ? b.description : undefined,
      modelPolicy: b.modelPolicy ?? undefined,
      executorPolicy: b.executorPolicy ?? undefined,
      skills: Array.isArray(b.skills) ? (b.skills as string[]) : undefined,
      tools: Array.isArray(b.tools) ? (b.tools as string[]) : undefined,
      knowledgeScopes: Array.isArray(b.knowledgeScopes) ? (b.knowledgeScopes as string[]) : undefined,
      permissions: Array.isArray(b.permissions) ? (b.permissions as string[]) : undefined,
      memoryScopes: Array.isArray(b.memoryScopes) ? (b.memoryScopes as string[]) : undefined,
      isDefault: typeof b.isDefault === "boolean" ? b.isDefault : undefined,
    },
  };
}

function validateUpdateInput(body: unknown): { ok: true; data: UpdateAgentProfileData } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required" };
  }
  const b = body as Record<string, unknown>;
  const data: UpdateAgentProfileData = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string") return { ok: false, error: "name must be a string" };
    data.name = b.name;
  }
  if (b.description !== undefined) {
    if (typeof b.description !== "string" && b.description !== null) {
      return { ok: false, error: "description must be a string or null" };
    }
    data.description = b.description === null ? undefined : b.description;
  }
  if (b.modelPolicy !== undefined) {
    if (b.modelPolicy !== null && !isAgentModelPolicy(b.modelPolicy)) {
      return { ok: false, error: "modelPolicy must have preferredModels (string[]), fallbackModel (string), maxTokens (number), temperature (number), or provider (string)" };
    }
    data.modelPolicy = b.modelPolicy ?? undefined;
  }
  if (b.executorPolicy !== undefined) {
    if (b.executorPolicy !== null && !isAgentExecutorPolicy(b.executorPolicy)) {
      return { ok: false, error: "executorPolicy must have executor (one of: self, codex, claude-code, opencode)" };
    }
    data.executorPolicy = b.executorPolicy;
  }
  if (b.skills !== undefined) {
    if (!Array.isArray(b.skills)) return { ok: false, error: "skills must be an array" };
    data.skills = b.skills as string[];
  }
  if (b.tools !== undefined) {
    if (!Array.isArray(b.tools)) return { ok: false, error: "tools must be an array" };
    data.tools = b.tools as string[];
  }
  if (b.knowledgeScopes !== undefined) {
    if (!Array.isArray(b.knowledgeScopes)) return { ok: false, error: "knowledgeScopes must be an array" };
    data.knowledgeScopes = b.knowledgeScopes as string[];
  }
  if (b.permissions !== undefined) {
    if (!Array.isArray(b.permissions)) return { ok: false, error: "permissions must be an array" };
    data.permissions = b.permissions as string[];
  }
  if (b.memoryScopes !== undefined) {
    if (!Array.isArray(b.memoryScopes)) return { ok: false, error: "memoryScopes must be an array" };
    data.memoryScopes = b.memoryScopes as string[];
  }
  if (b.isDefault !== undefined) {
    if (typeof b.isDefault !== "boolean") return { ok: false, error: "isDefault must be a boolean" };
    data.isDefault = b.isDefault;
  }
  return { ok: true, data };
}

agentProfileRoutes.get(
  "/",
  withErrorHandling("agent-profiles/list", async (c) => {
    const { agentProfiles } = getRepositories();
    const profiles = await agentProfiles.getAll();
    return c.json({ data: profiles });
  }),
);

agentProfileRoutes.get(
  "/default",
  withErrorHandling("agent-profiles/default", async (c) => {
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.getDefault();
    if (!profile) {
      return apiError(c, "No default agent profile found", 404);
    }
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.post(
  "/",
  withErrorHandling("agent-profiles/create", async (c) => {
    const body = await c.req.json();
    const validation = validateCreateInput(body);
    if (!validation.ok) {
      return apiError(c, validation.error, 400);
    }
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.create(validation.input);
    return c.json({ data: profile }, 201);
  }),
);

agentProfileRoutes.get(
  "/:id",
  withErrorHandling("agent-profiles/get", async (c) => {
    const { agentProfiles } = getRepositories();
    const id = c.req.param("id")!;
    const profile = await agentProfiles.getById(id);
    if (!profile) {
      return apiError(c, "Agent profile not found", 404);
    }
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.patch(
  "/:id",
  withErrorHandling("agent-profiles/update", async (c) => {
    const id = c.req.param("id")!;
    const body = await c.req.json();
    const validation = validateUpdateInput(body);
    if (!validation.ok) {
      return apiError(c, validation.error, 400);
    }
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    const profile = await agentProfiles.update(id, validation.data);
    return c.json({ data: profile });
  }),
);

agentProfileRoutes.delete(
  "/:id",
  withErrorHandling("agent-profiles/delete", async (c) => {
    const id = c.req.param("id")!;
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    if (existing.isDefault) {
      return apiError(c, "Cannot delete the default agent profile", 400);
    }
    await agentProfiles.delete(id);
    return c.json({ data: { deleted: true } });
  }),
);

agentProfileRoutes.post(
  "/:id/set-default",
  withErrorHandling("agent-profiles/set-default", async (c) => {
    const id = c.req.param("id")!;
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    const all = await agentProfiles.getAll();
    for (const p of all) {
      if (p.isDefault) {
        await agentProfiles.update(p.id, { isDefault: false });
      }
    }
    const profile = await agentProfiles.update(id, { isDefault: true });
    return c.json({ data: profile });
  }),
);

export default agentProfileRoutes;
