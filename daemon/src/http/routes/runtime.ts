import { Hono } from "hono";
import { buildRuntimeComponents } from "../../runtime-host/status.js";
import { apiError, ErrorCodes } from "../../shared/errors.js";

const runtime = new Hono();

// Security: only allow loopback connections
function isLoopback(addr: string): boolean {
  const clean = addr.replace(/^::ffff:/, "");
  return clean === "127.0.0.1" || clean === "::1" || clean === "localhost";
}

runtime.get("/components", async (c) => {
  const components = await buildRuntimeComponents();
  return c.json({ components });
});

runtime.post("/shutdown", async (c) => {
  const incoming = (c.env as Record<string, unknown>)?.incoming as
    | { socket?: { remoteAddress?: string } }
    | undefined;
  const peerAddress = incoming?.socket?.remoteAddress;
  if (peerAddress && !isLoopback(peerAddress)) {
    return apiError(c, "Shutdown only allowed from loopback", 403, ErrorCodes.PERMISSION_DENIED);
  }
  console.log("[Jarvis] Shutdown requested via API");
  setTimeout(() => process.exit(0), 200);
  return c.json({ status: "shutting_down" });
});

export default runtime;
