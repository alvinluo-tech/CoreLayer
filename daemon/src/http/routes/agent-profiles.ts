import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";

const agentProfileRoutes = new Hono();

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

export default agentProfileRoutes;
