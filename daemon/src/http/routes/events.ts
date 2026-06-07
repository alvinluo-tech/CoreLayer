import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";

const app = new Hono();

// GET / - Query event log with optional filters
app.get("/", async (c) => {
  try {
    const type = c.req.query("type");
    const projectId = c.req.query("projectId");
    const agentRunId = c.req.query("agentRunId");
    const runtimeId = c.req.query("runtimeId");
    const since = c.req.query("since");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const filters = {
      type: type ?? undefined,
      projectId: projectId ?? undefined,
      agentRunId: agentRunId ?? undefined,
      runtimeId: runtimeId ?? undefined,
      since: since ?? undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    };

    const repo = getRepositories().eventLog;
    const [events, total] = await Promise.all([
      repo.query(filters),
      repo.count(filters),
    ]);

    return c.json({ events, total, count: events.length });
  } catch (err) {
    logError("events/query", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
