/**
 * WeChat Channel — Webhook Handler
 *
 * Handles the Hono route for WeChat webhook endpoints.
 * GET: Verification endpoint (WeChat server validation)
 * POST: Message receiving endpoint
 */

import { Hono } from "hono";
import type { WeChatConfig } from "./types.js";
import { verifyWeChatSignature } from "./auth.js";
import { normalizeWeChatMessage } from "./message-normalizer.js";
import type { ChannelRuntime } from "../../channel-runtime.js";

export function createWeChatWebhookRoutes(
  config: WeChatConfig,
  runtime: ChannelRuntime,
): Hono {
  const app = new Hono();

  // GET: WeChat server verification
  app.get("/", (c) => {
    const signature = c.req.query("signature") ?? "";
    const timestamp = c.req.query("timestamp") ?? "";
    const nonce = c.req.query("nonce") ?? "";
    const echoStr = c.req.query("echostr") ?? "";

    if (verifyWeChatSignature(config, signature, timestamp, nonce)) {
      return c.text(echoStr);
    }

    return c.text("Invalid signature", 403);
  });

  // POST: Receive messages
  app.post("/", async (c) => {
    // Verify signature
    const signature = c.req.header("signature") ?? "";
    const timestamp = c.req.header("timestamp") ?? "";
    const nonce = c.req.header("nonce") ?? "";

    if (!verifyWeChatSignature(config, signature, timestamp, nonce)) {
      return c.text("Invalid signature", 403);
    }

    // Parse XML body (WeChat sends XML)
    const body = await c.req.parseBody();
    // Note: In production, parse XML properly. For now, assume JSON for simplicity.
    // Real implementation would use xml2js or similar.
    const webhookBody = body as unknown as import("./types.js").WeChatWebhookBody;

    // Normalize to channel message (validation / future use)
    normalizeWeChatMessage(webhookBody);

    // Process through channel runtime (async, return "success" immediately for WeChat)
    runtime.handleInbound("wechat", c.req.raw).catch((err: Error) => {
      console.error("[WeChat] Inbound processing failed:", err);
    });

    // WeChat requires "success" response within 5 seconds
    return c.text("success");
  });

  return app;
}
