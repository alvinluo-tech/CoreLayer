import { Hono } from "hono";
import { getRepositories } from "../../db/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";

const app = new Hono();

// GET / - Query audit log with optional filters
app.get("/", async (c) => {
  try {
    const actor = c.req.query("actor");
    const action = c.req.query("action");
    const riskLevel = c.req.query("riskLevel");
    const since = c.req.query("since");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const filters = {
      actor: actor ?? undefined,
      action: action ?? undefined,
      riskLevel: riskLevel ?? undefined,
      since: since ?? undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    };

    const repo = getRepositories().auditLog;
    const [entries, total] = await Promise.all([
      repo.query(filters),
      repo.count(filters),
    ]);

    return c.json({ entries, total, count: entries.length });
  } catch (err) {
    logError("audit/query", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
