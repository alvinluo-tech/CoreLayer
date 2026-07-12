import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";
import { logAuditEntry } from "../../persistence/audit-log.js";
import { z } from "zod";

const memoryRoutes = new Hono();

const updateMemorySchema = z.object({
  key: z.string().optional(),
  value: z.string().optional(),
  type: z.enum(["fact", "preference", "context", "summary"]).optional(),
});


memoryRoutes.get(
  "/",
  withErrorHandling("memories/list", async (c) => {
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
  }),
);

memoryRoutes.get(
  "/search",
  withErrorHandling("memories/search", async (c) => {
    const { memories } = getRepositories();
    const query = c.req.query("q");
    if (!query) {
      return apiError(c, "Query parameter 'q' is required", 400);
    }
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number(limitParam) : 20;
    const results = await memories.searchScored(query, "default", limit);
    return c.json({ data: results });
  }),
);

memoryRoutes.patch(
  "/:id",
  withErrorHandling("memories/update", async (c) => {
    const { memories } = getRepositories();
    const id = c.req.param("id")!;
    const body = await c.req.json().catch(() => ({}));
    const parsed = updateMemorySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, parsed.error.errors[0]?.message || "Validation failed", 400);
    }
    const validData = parsed.data;

    const existing = await memories.getAll().then((all) => all.find((m) => m.id === id));
    if (!existing) {
      return apiError(c, "Memory not found", 404);
    }

    const updated = await memories.upsert({
      key: validData.key ?? existing.key,
      value: validData.value ?? existing.value,
      type: validData.type ?? existing.type,
      scopeType: existing.scopeType,
      scopeId: existing.scopeId,
    });

    await logAuditEntry({
      actor: "user",
      action: "memory.update",
      resource: `memory:${id}`,
      decision: "approved",
      result: "updated",
      metadata: { id, key: existing.key, scopeType: existing.scopeType },
    });

    return c.json({ data: updated });
  }),
);

memoryRoutes.delete(
  "/:id",
  withErrorHandling("memories/delete", async (c) => {
    const { memories } = getRepositories();
    const id = c.req.param("id")!;
    const existing = await memories.getAll().then((all) => all.find((m) => m.id === id));
    if (!existing) {
      return apiError(c, "Memory not found", 404);
    }
    await memories.delete(id);
    await logAuditEntry({
      actor: "user",
      action: "memory.delete",
      resource: `memory:${id}`,
      decision: "approved",
      result: "deleted",
      metadata: { id, key: existing.key, scopeType: existing.scopeType },
    });
    return c.json({ success: true });
  }),
);

export default memoryRoutes;
