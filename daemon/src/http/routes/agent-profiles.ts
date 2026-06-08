import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import type { CreateAgentProfileInput, UpdateAgentProfileData } from "../../persistence/repository.js";

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
  if (b.modelPolicy !== undefined) data.modelPolicy = b.modelPolicy;
  if (b.executorPolicy !== undefined) data.executorPolicy = b.executorPolicy;
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

/**
 * GET /api/agent-profiles - List all agent profiles
 */
agentProfileRoutes.get("/", async (c) => {
  try {
    const { agentProfiles } = getRepositories();
    const profiles = await agentProfiles.getAll();
    return c.json({ data: profiles });
  } catch (err) {
    logError("agent-profiles/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/agent-profiles/default - Get default agent profile
 */
agentProfileRoutes.get("/default", async (c) => {
  try {
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.getDefault();
    if (!profile) {
      return apiError(c, "No default agent profile found", 404);
    }
    return c.json({ data: profile });
  } catch (err) {
    logError("agent-profiles/default", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/agent-profiles - Create a new agent profile
 */
agentProfileRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateCreateInput(body);
    if (!validation.ok) {
      return apiError(c, validation.error, 400);
    }
    const { agentProfiles } = getRepositories();
    const profile = await agentProfiles.create(validation.input);
    return c.json({ data: profile }, 201);
  } catch (err) {
    logError("agent-profiles/create", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/agent-profiles/:id - Get a specific agent profile
 */
agentProfileRoutes.get("/:id", async (c) => {
  try {
    const { agentProfiles } = getRepositories();
    const id = c.req.param("id");
    const profile = await agentProfiles.getById(id);
    if (!profile) {
      return apiError(c, "Agent profile not found", 404);
    }
    return c.json({ data: profile });
  } catch (err) {
    logError("agent-profiles/get", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * PATCH /api/agent-profiles/:id - Update an agent profile
 */
agentProfileRoutes.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
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
  } catch (err) {
    logError("agent-profiles/update", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * DELETE /api/agent-profiles/:id - Delete an agent profile
 */
agentProfileRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
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
  } catch (err) {
    logError("agent-profiles/delete", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * POST /api/agent-profiles/:id/set-default - Set a profile as the default
 */
agentProfileRoutes.post("/:id/set-default", async (c) => {
  try {
    const id = c.req.param("id");
    const { agentProfiles } = getRepositories();
    const existing = await agentProfiles.getById(id);
    if (!existing) {
      return apiError(c, "Agent profile not found", 404);
    }
    // Clear default on all profiles, then set the target
    const all = await agentProfiles.getAll();
    for (const p of all) {
      if (p.isDefault) {
        await agentProfiles.update(p.id, { isDefault: false });
      }
    }
    const profile = await agentProfiles.update(id, { isDefault: true });
    return c.json({ data: profile });
  } catch (err) {
    logError("agent-profiles/set-default", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default agentProfileRoutes;
