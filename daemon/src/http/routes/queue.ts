import { Hono } from "hono";
import { getQueue, getQueueStatus } from "../../workflow/queue-service.js";
import { getDispatcherStatus } from "../../workflow/run-dispatcher.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const queueRoutes = new Hono();

queueRoutes.get(
  "/",
  withErrorHandling("queue/list", async (c) => {
    const queue = await getQueue();
    return c.json({ data: queue });
  }),
);

queueRoutes.get(
  "/status",
  withErrorHandling("queue/status", async (c) => {
    const status = await getQueueStatus();
    return c.json({ data: status });
  }),
);

queueRoutes.get(
  "/resources",
  withErrorHandling("queue/resources", async (c) => {
    const status = getDispatcherStatus();
    return c.json({ data: status });
  }),
);

export default queueRoutes;
