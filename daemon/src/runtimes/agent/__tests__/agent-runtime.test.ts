import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RuntimeEvent } from "@jarvis/runtime-protocol";

vi.mock("hono", () => {
  class MockHono {
    private routes: Array<{
      method: string;
      path: string;
      handler: (c: Record<string, unknown>) => Promise<unknown>;
    }> = [];

    use(_path: string, _middleware: unknown) {
      return this;
    }

    get(path: string, handler: (c: Record<string, unknown>) => Promise<unknown>) {
      this.routes.push({ method: "GET", path, handler });
      return this;
    }

    post(path: string, handler: (c: Record<string, unknown>) => Promise<unknown>) {
      this.routes.push({ method: "POST", path, handler });
      return this;
    }

    async request(path: string, init?: { method?: string; body?: any }) {
      const method = init?.method ?? "GET";
      const route = this.routes.find(
        (r) => r.path === path && r.method === method,
      );
      if (!route) {
        return new Response("Not Found", { status: 404 });
      }

      let bodyData: unknown = undefined;
      if (init?.body !== undefined) {
        bodyData = init.body;
      }

      const jsonBody = async <T = unknown>(): Promise<T> => bodyData as T;

      const c = {
        req: {
          json: jsonBody,
        },
        json: (data: unknown, status?: number) =>
          new Response(JSON.stringify(data), {
            status: status ?? 200,
            headers: { "Content-Type": "application/json" },
          }),
      };

      return route.handler(c) as Promise<Response>;
    }

    getRoutes() {
      return this.routes;
    }
  }
  return { Hono: MockHono };
});

vi.mock("hono/cors", () => ({
  cors: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

const {
  AgentRuntime,
  createAgentRuntime,
} = await import("../agent-runtime.js");

const baseConfig = {
  id: "test-agent",
  kind: "agent" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("AgentRuntime", () => {
  let runtime: InstanceType<typeof AgentRuntime>;

  beforeEach(() => {
    runtime = new AgentRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("exports a default instance via factory", () => {
      const instance = createAgentRuntime(baseConfig);
      expect(instance).toBeInstanceOf(AgentRuntime);
    });

    it("has start method", () => {
      expect(typeof runtime.start).toBe("function");
    });

    it("has stop method via shutdown", () => {
      expect(typeof runtime.shutdown).toBe("function");
    });

    it("has status method via getStatus", () => {
      expect(typeof runtime.getStatus).toBe("function");
    });

    it("has getInfo method", () => {
      expect(typeof runtime.getInfo).toBe("function");
    });

    it("has getCapabilities method", () => {
      expect(typeof runtime.getCapabilities).toBe("function");
    });

    it("has startRun method", () => {
      expect(typeof runtime.startRun).toBe("function");
    });

    it("has cancelRun method", () => {
      expect(typeof runtime.cancelRun).toBe("function");
    });

    it("has healthCheck method", () => {
      expect(typeof runtime.healthCheck).toBe("function");
    });

    it("has createRouter method", () => {
      expect(typeof runtime.createRouter).toBe("function");
    });

    it("has completeRun method", () => {
      expect(typeof runtime.completeRun).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns runtime info with agent kind", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-agent");
      expect(info.kind).toBe("agent");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
      expect(info.health).toBe("unknown");
      expect(info.restartCount).toBe(0);
    });

    it("returns a copy, not the internal reference", () => {
      const info1 = runtime.getInfo();
      const info2 = runtime.getInfo();
      expect(info1).not.toBe(info2);
      expect(info1).toEqual(info2);
    });
  });

  describe("getStatus", () => {
    it("returns status with zero uptime before start", async () => {
      const status = await runtime.getStatus();
      expect(status.uptime).toBe(0);
      expect(status.activeRun).toBe(false);
      expect(status.completedRuns).toBe(0);
      expect(status.failedRuns).toBe(0);
    });

    it("includes runtime info in status", async () => {
      const status = await runtime.getStatus();
      expect(status.id).toBe("test-agent");
      expect(status.kind).toBe("agent");
    });
  });

  describe("getCapabilities", () => {
    it("returns agent-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("agent:run");
      expect(caps.capabilities).toContain("agent:stream");
      expect(caps.capabilities).toContain("agent:cancel");
      expect(caps.capabilities).toContain("model:select");
      expect(caps.supportedEvents).toContain("run:started");
      expect(caps.supportedEvents).toContain("run:completed");
    });

    it("returns maxConcurrentRuns from config", () => {
      const caps = runtime.getCapabilities();
      expect(caps.maxConcurrentRuns).toBe(3);
    });

    it("respects custom maxConcurrentRuns config", () => {
      const custom = new AgentRuntime({
        ...baseConfig,
        maxConcurrentRuns: 5,
      });
      const caps = custom.getCapabilities();
      expect(caps.maxConcurrentRuns).toBe(5);
    });
  });

  describe("startRun", () => {
    it("starts a run and returns started status", async () => {
      const result = await runtime.startRun({
        runId: "run-1",
        input: { prompt: "test" },
      });
      expect(result.runId).toBe("run-1");
      expect(result.status).toBe("started");
    });

    it("rejects when max concurrent runs reached", async () => {
      await runtime.startRun({ runId: "run-1", input: {} });
      await runtime.startRun({ runId: "run-2", input: {} });
      await runtime.startRun({ runId: "run-3", input: {} });

      const result = await runtime.startRun({ runId: "run-4", input: {} });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("Max concurrent runs reached");
    });

    it("emits run:started event", async () => {
      const events: RuntimeEvent[] = [];
      const iterator = runtime.subscribeToEvents()[Symbol.asyncIterator]();

      // Start collecting events in background
      const collectPromise = (async () => {
        for (let i = 0; i < 3; i++) {
          try {
            const next = await Promise.race([
              iterator.next(),
              new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 100)),
            ]) as any;
            if (!next.done) events.push(next.value);
          } catch {
            break;
          }
        }
      })();

      await runtime.startRun({ runId: "run-1", input: {} });
      await collectPromise;

      expect(events.some((e) => e.type === "run:started")).toBe(true);
    });
  });

  describe("cancelRun", () => {
    it("cancels an active run", async () => {
      await runtime.startRun({ runId: "run-1", input: {} });
      const result = await runtime.cancelRun({
        runId: "run-1",
        reason: "User cancelled",
      });
      expect(result.runId).toBe("run-1");
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown run", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });

    it("increments failedRuns counter", async () => {
      await runtime.startRun({ runId: "run-1", input: {} });
      await runtime.cancelRun({ runId: "run-1" });

      const status = await runtime.getStatus();
      expect(status.failedRuns).toBe(1);
    });
  });

  describe("completeRun", () => {
    it("completes an active run", async () => {
      await runtime.startRun({ runId: "run-1", input: {} });
      runtime.completeRun("run-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
      expect(status.activeRun).toBe(false);
    });

    it("emits run:completed event", async () => {
      const events: RuntimeEvent[] = [];
      const iterator = runtime.subscribeToEvents()[Symbol.asyncIterator]();

      const collectPromise = (async () => {
        for (let i = 0; i < 5; i++) {
          try {
            const next = await Promise.race([
              iterator.next(),
              new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 100)),
            ]) as any;
            if (!next.done) events.push(next.value);
          } catch {
            break;
          }
        }
      })();

      await runtime.startRun({ runId: "run-1", input: {} });
      runtime.completeRun("run-1");
      await collectPromise;

      expect(events.some((e) => e.type === "run:completed")).toBe(true);
    });

    it("ignores unknown run IDs", () => {
      runtime.completeRun("nonexistent");
      // should not throw
    });
  });

  describe("shutdown", () => {
    it("cancels all active runs and sets unhealthy", async () => {
      await runtime.startRun({ runId: "run-1", input: {} });
      await runtime.startRun({ runId: "run-2", input: {} });

      await runtime.shutdown({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });

      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
      expect(status.failedRuns).toBe(2);
      expect(status.activeRun).toBe(false);
    });
  });

  describe("healthCheck", () => {
    it("sets health to healthy and returns true", async () => {
      const result = await runtime.healthCheck();
      expect(result).toBe(true);

      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
    });
  });

  describe("start", () => {
    it("sets startedAt and health", async () => {
      await runtime.start();

      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Hono router", () => {
    it("creates a router", () => {
      const router = runtime.createRouter();
      expect(router).toBeDefined();
    });

    it("GET /health returns ok when healthy", async () => {
      const router = runtime.createRouter();
      await runtime.start();

      const res = await router.request("/health", { method: "GET" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("uptime");
    });

    it("GET /health returns error before start", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/health", { method: "GET" });
      const body = await res.json();
      expect(body.status).toBe("error");
    });

    it("GET /runtime/status returns status", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/status", { method: "GET" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("test-agent");
      expect(body.kind).toBe("agent");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.capabilities).toContain("agent:run");
      expect(body.maxConcurrentRuns).toBe(3);
    });

    it("POST /runtime/start-run starts a run", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "run-1", input: { prompt: "test" } } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /runtime/cancel-run cancels a run", async () => {
      const router = runtime.createRouter();
      await runtime.startRun({ runId: "run-1", input: {} });

      const res = await router.request("/runtime/cancel-run", {
        method: "POST",
        body: { runId: "run-1", reason: "test" } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("cancelled");
    });

    it("POST /runtime/shutdown returns shutdown_initiated", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/shutdown", {
        method: "POST",
        body: { status: "shutdown_initiated", timestamp: new Date().toISOString() } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("shutdown_initiated");
    });
  });

  describe("subscribeToEvents", () => {
    it("yields events as they are emitted", async () => {
      const events: RuntimeEvent[] = [];
      const iterator = runtime.subscribeToEvents()[Symbol.asyncIterator]();

      const collectPromise = (async () => {
        for (let i = 0; i < 3; i++) {
          try {
            const next = await Promise.race([
              iterator.next(),
              new Promise((r) => setTimeout(() => r({ done: true, value: undefined }), 100)),
            ]) as any;
            if (!next.done) events.push(next.value);
          } catch {
            break;
          }
        }
      })();

      await runtime.startRun({ runId: "run-1", input: {} });
      await collectPromise;

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "run:started")).toBe(true);
    });
  });
});
