import { Hono } from "hono";
import { configManager, type JarvisConfig } from "../../config/config-manager.js";
import { apiError } from "../../shared/errors.js";
import { withErrorHandling } from "../middleware/error-handler.js";

const app = new Hono();

app.get(
  "/tick",
  withErrorHandling("settings/tick/get", (c) => {
    const tick = configManager.getTickConfig();
    return c.json(tick);
  }),
);

app.put(
  "/tick",
  withErrorHandling("settings/tick/update", async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const patch: Partial<JarvisConfig["tick"]> = {};

    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.intervalMinutes === "number") {
      if (body.intervalMinutes < 5 || body.intervalMinutes > 240) {
        return apiError(c, "intervalMinutes must be between 5 and 240", 400);
      }
      patch.intervalMinutes = body.intervalMinutes;
    }
    if (typeof body.modelId === "string" || body.modelId === null) patch.modelId = body.modelId ?? undefined;
    if (typeof body.providerId === "string" || body.providerId === null) patch.providerId = body.providerId ?? undefined;

    configManager.updateTickConfig(patch);

    return c.json({ success: true, config: configManager.getTickConfig() });
  }),
);

export default app;
