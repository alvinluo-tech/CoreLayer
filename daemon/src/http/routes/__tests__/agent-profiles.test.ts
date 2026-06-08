/**
 * Unit tests for agent-profiles route validation logic.
 *
 * Tests the validateCreateInput and validateUpdateInput functions
 * by exercising the route handler through Hono's test client.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import agentProfileRoutes from "../agent-profiles.js";

// We test the validation logic by mounting the routes and calling them
const app = new Hono();
app.route("/api/agent-profiles", agentProfileRoutes);

describe("agent-profiles route", () => {
  describe("POST /api/agent-profiles — validation", () => {
    it("rejects empty body", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing name", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "test" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects non-string name", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 123 }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid modelPolicy shape", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          modelPolicy: { preferredModels: "not-an-array" },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid executorPolicy shape", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          executorPolicy: { executor: "invalid-executor" },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects non-array skills", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          skills: "not-an-array",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects non-array tools", async () => {
      const res = await app.request("/api/agent-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          tools: "not-an-array",
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/agent-profiles/:id — validation", () => {
    it("rejects non-string name in update", async () => {
      const res = await app.request("/api/agent-profiles/fake-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 42 }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid modelPolicy in update", async () => {
      const res = await app.request("/api/agent-profiles/fake-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelPolicy: { preferredModels: "bad" },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid executorPolicy in update", async () => {
      const res = await app.request("/api/agent-profiles/fake-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executorPolicy: { executor: "unknown" },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts valid partial update", async () => {
      const res = await app.request("/api/agent-profiles/fake-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "updated" }),
      });
      // May return 404 if profile doesn't exist, but not 400 validation error
      expect(res.status).not.toBe(400);
    });
  });
});
