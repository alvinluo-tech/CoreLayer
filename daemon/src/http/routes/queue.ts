import { Hono } from "hono";
import { getQueue, getQueueStatus } from "../../workflow/queue-service.js";
import { getDispatcherStatus } from "../../workflow/run-dispatcher.js";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";

const queueRoutes = new Hono();

/**
 * GET /api/runtime/queue - List queued items
 */
queueRoutes.get("/", async (c) => {
  try {
    const queue = await getQueue();
    return c.json({ data: queue });
  } catch (err) {
    logError("queue/list", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/runtime/queue/status - Get queue status counts
 */
queueRoutes.get("/status", async (c) => {
  try {
    const status = await getQueueStatus();
    return c.json({ data: status });
  } catch (err) {
    logError("queue/status", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

/**
 * GET /api/runtime/queue/resources - Current resource usage
 */
queueRoutes.get("/resources", async (c) => {
  try {
    const status = getDispatcherStatus();
    return c.json({ data: status });
  } catch (err) {
    logError("queue/resources", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default queueRoutes;
