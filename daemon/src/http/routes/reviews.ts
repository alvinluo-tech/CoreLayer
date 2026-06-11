import { Hono } from "hono";
import { getRepositories } from "../../persistence/factory.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

app.get(
  "/daily-summary",
  withErrorHandling("reviews/daily-summary", async (c) => {
    const date = c.req.query("date");
    const result = await getRepositories().reviews.getDailySummary(date);
    return c.json(result);
  }),
);

app.get(
  "/weekly-stats",
  withErrorHandling("reviews/weekly-stats", async (c) => {
    const weekStart = c.req.query("weekStart");
    const result = await getRepositories().reviews.getWeeklyStats(weekStart);
    return c.json(result);
  }),
);

export default app;
