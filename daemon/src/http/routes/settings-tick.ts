import { Hono } from "hono";
import { configManager, type JarvisConfig } from "../../config/config-manager.js";
import { apiError, logError } from "../../utils/errors.js";

const app = new Hono();

app.get("/tick", (c) => {
  try {
    const tick = configManager.getTickConfig();
    return c.json(tick);
  } catch (err) {
    logError("settings/tick/get", err);
    return apiError(c, "Failed to get TICK config", 500);
  }
});

app.put("/tick", async (c) => {
  try {
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
  } catch (err) {
    logError("settings/tick/update", err);
    return apiError(c, "Failed to update TICK config", 500);
  }
});

export default app;
