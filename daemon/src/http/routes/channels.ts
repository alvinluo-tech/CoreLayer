/**
 * Channel Runtime — HTTP Routes
 *
 * Webhook endpoints for each channel platform.
 * Each channel gets its own sub-route under /channels/:channelId.
 */

import { Hono } from "hono";
import { getChannel } from "../../runtimes/integration/registry.js";

export const channelRoutes = new Hono();

// Generic webhook endpoint — dispatches to the correct channel adapter
channelRoutes.post("/:channelId/webhook", async (c) => {
  const channelId = c.req.param("channelId");
  const adapter = getChannel(channelId);

  if (!adapter) {
    return c.json({ error: `Channel not registered: ${channelId}` }, 404);
  }

  try {
    // Verify webhook if adapter supports it
    if (adapter.verifyWebhook) {
      const valid = await adapter.verifyWebhook(c.req.raw);
      if (!valid) {
        return c.json({ error: "Webhook verification failed" }, 403);
      }
    }

    // Parse the inbound message
    const message = await adapter.receive(c.req.raw);

    // Forward to ChannelRuntime (injected via middleware or context)
    // For now, return the parsed message for testing
    return c.json({
      data: {
        channelId: message.channelId,
        platformUserId: message.platformUserId,
        content: message.content,
        timestamp: message.timestamp,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// List registered channels
channelRoutes.get("/", async (c) => {
  const { getAllChannels } = await import("../../runtimes/integration/registry.js");
  const channels = getAllChannels();
  return c.json({
    data: channels.map((e) => ({
      id: e.adapter.id,
      name: e.adapter.name,
      enabled: e.enabled,
      registeredAt: e.registeredAt,
    })),
  });
});

// Health check for a specific channel
channelRoutes.get("/:channelId/health", async (c) => {
  const channelId = c.req.param("channelId");
  const adapter = getChannel(channelId);
  return c.json({
    data: {
      channelId,
      healthy: adapter !== undefined,
      timestamp: new Date().toISOString(),
    },
  });
});
