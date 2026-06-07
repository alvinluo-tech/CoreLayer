import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { apiError, extractErrorMessage, logError } from "../../utils/errors.js";

const app = new Hono();

// GET /daily-summary - Get daily summary
app.get("/daily-summary", async (c) => {
  try {
    const date = c.req.query("date");
    const result = await getRepositories().reviews.getDailySummary(date);
    return c.json(result);
  } catch (err) {
    logError("reviews/daily-summary", err);
    return apiError(c, extractErrorMessage(err));
  }
});

// GET /weekly-stats - Get weekly stats
app.get("/weekly-stats", async (c) => {
  try {
    const weekStart = c.req.query("weekStart");
    const result = await getRepositories().reviews.getWeeklyStats(weekStart);
    return c.json(result);
  } catch (err) {
    logError("reviews/weekly-stats", err);
    return apiError(c, extractErrorMessage(err));
  }
});

export default app;
