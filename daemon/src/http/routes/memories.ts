import { Hono } from "hono";
import { getRepositories } from "../../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";

const memoryRoutes = new Hono();

/**
 * GET /api/memories - List all memories
 */
memoryRoutes.get("/", async (c) => {
  try {
    const { memories } = getRepositories();
    const type = c.req.query("type");
    const scopeType = c.req.query("scopeType");
    const scopeId = c.req.query("scopeId");

    let result;
    if (scopeType && scopeId) {
      result = await memories.fetchByScope(
        scopeType as "user" | "workspace" | "project" | "agent" | "task" | "conversation",
        scopeId,
      );
    } else if (type) {
      result = await memories.getByType(type as "fact" | "preference" | "context" | "summary");
    } else {
      result = await memories.getAll();
    }
    return c.json({ data: result });
  } catch (err) {
    logError("memories/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/memories/search - Search memories
 */
memoryRoutes.get("/search", async (c) => {
  try {
    const { memories } = getRepositories();
    const query = c.req.query("q");
    if (!query) {
      return apiError(c, "Query parameter 'q' is required", 400);
    }
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 20;
    const results = await memories.searchScored(query, "default", limit);
    return c.json({ data: results });
  } catch (err) {
    logError("memories/search", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * PATCH /api/memories/:id - Update a memory
 */
memoryRoutes.patch("/:id", async (c) => {
  try {
    const { memories } = getRepositories();
    const id = c.req.param("id");
    const body = await c.req.json<{ key?: string; value?: string; type?: string }>();

    const existing = await memories.getAll().then((all) => all.find((m) => m.id === id));
    if (!existing) {
      return apiError(c, "Memory not found", 404);
    }

    const updated = await memories.upsert({
      key: body.key ?? existing.key,
      value: body.value ?? existing.value,
      type: (body.type as "fact" | "preference" | "context" | "summary") ?? existing.type,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
    });
    return c.json({ data: updated });
  } catch (err) {
    logError("memories/update", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * DELETE /api/memories/:id - Delete a memory
 */
memoryRoutes.delete("/:id", async (c) => {
  try {
    const { memories } = getRepositories();
    const id = c.req.param("id");
    const deleted = await memories.delete(id);
    if (!deleted) {
      return apiError(c, "Memory not found", 404);
    }
    return c.json({ success: true });
  } catch (err) {
    logError("memories/delete", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default memoryRoutes;
