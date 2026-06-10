import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockBuildRuntimeComponents } = vi.hoisted(() => ({
  mockBuildRuntimeComponents: vi.fn(),
}));

vi.mock("../../runtime-host/status.js", () => ({
  buildRuntimeComponents: (...args: unknown[]) => mockBuildRuntimeComponents(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  ErrorCodes: { PERMISSION_DENIED: "PERMISSION_DENIED" },
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./runtime.js";

function makeRequest(path: string, method = "GET", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("runtime route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /components", () => {
    it("returns runtime components", async () => {
      mockBuildRuntimeComponents.mockResolvedValue([
        { name: "agent", status: "running" },
      ]);

      const res = await app.fetch(makeRequest("/components"));
      const json = (await res.json()) as { components: unknown[] };

      expect(res.status).toBe(200);
      expect(json.components).toHaveLength(1);
    });

    it("returns empty array when no components", async () => {
      mockBuildRuntimeComponents.mockResolvedValue([]);

      const res = await app.fetch(makeRequest("/components"));
      const json = (await res.json()) as { components: unknown[] };

      expect(res.status).toBe(200);
      expect(json.components).toHaveLength(0);
    });
  });

  describe("POST /shutdown", () => {
    it("returns shutting_down status from loopback", async () => {
      const res = await app.fetch(makeRequest("/shutdown", "POST"));
      const json = (await res.json()) as { status: string };

      expect(res.status).toBe(200);
      expect(json.status).toBe("shutting_down");
    });
  });
});
