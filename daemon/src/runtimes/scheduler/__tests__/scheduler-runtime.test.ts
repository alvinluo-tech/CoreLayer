import { describe, it, expect, beforeEach, vi } from "vitest";

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

      const c = {
        req: {
          json: async <T = unknown>(): Promise<T> => bodyData as T,
          query: (_name: string) => undefined,
          param: (_name: string) => "",
        },
        json: (data: unknown, status?: number) =>
          new Response(JSON.stringify(data), {
            status: status ?? 200,
            headers: { "Content-Type": "application/json" },
          }),
      };

      return route.handler(c) as Promise<Response>;
    }
  }
  return { Hono: MockHono };
});

vi.mock("hono/cors", () => ({
  cors: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

const mockRunTick = vi.fn();
vi.mock("../scheduler.js", () => ({
  runTick: (...args: unknown[]) => mockRunTick(...args),
}));

const mockGetRepositories = vi.fn();
vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: (...args: unknown[]) => mockGetRepositories(...args),
}));

const {
  SchedulerRuntime,
  createSchedulerRuntime,
} = await import("../scheduler-runtime.js");

const baseConfig = {
  id: "test-scheduler",
  kind: "scheduler" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("SchedulerRuntime", () => {
  let runtime: InstanceType<typeof SchedulerRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new SchedulerRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createSchedulerRuntime(baseConfig);
      expect(instance).toBeInstanceOf(SchedulerRuntime);
    });

    it("has all ManagedRuntime methods", () => {
      expect(typeof runtime.start).toBe("function");
      expect(typeof runtime.shutdown).toBe("function");
      expect(typeof runtime.getStatus).toBe("function");
      expect(typeof runtime.getInfo).toBe("function");
      expect(typeof runtime.getCapabilities).toBe("function");
      expect(typeof runtime.startRun).toBe("function");
      expect(typeof runtime.cancelRun).toBe("function");
      expect(typeof runtime.healthCheck).toBe("function");
      expect(typeof runtime.createRouter).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns scheduler info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-scheduler");
      expect(info.kind).toBe("scheduler");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
    });

    it("returns a copy", () => {
      const info1 = runtime.getInfo();
      const info2 = runtime.getInfo();
      expect(info1).not.toBe(info2);
    });
  });

  describe("getCapabilities", () => {
    it("returns scheduler-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("scheduler:tick");
      expect(caps.capabilities).toContain("scheduler:cron");
      expect(caps.capabilities).toContain("scheduler:idle_detection");
      expect(caps.supportedEvents).toContain("scheduler:tick");
      expect(caps.maxConcurrentRuns).toBe(1);
    });
  });

  describe("getStatus", () => {
    it("returns zero uptime before start", async () => {
      const status = await runtime.getStatus();
      expect(status.uptime).toBe(0);
      expect(status.activeRun).toBe(false);
      expect(status.completedRuns).toBe(0);
    });
  });

  describe("startRun", () => {
    it("starts a tick", async () => {
      const result = await runtime.startRun({
        runId: "tick-1",
        input: {},
      });
      expect(result.status).toBe("started");
      expect(result.runId).toBe("tick-1");
    });

    it("rejects when tick already in progress", async () => {
      await runtime.startRun({ runId: "tick-1", input: {} });
      const result = await runtime.startRun({ runId: "tick-2", input: {} });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("Tick already in progress");
    });
  });

  describe("cancelRun", () => {
    it("cancels an active tick", async () => {
      await runtime.startRun({ runId: "tick-1", input: {} });
      const result = await runtime.cancelRun({ runId: "tick-1" });
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown tick", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("completeTick", () => {
    it("increments completedTicks counter", async () => {
      await runtime.startRun({ runId: "tick-1", input: {} });
      runtime.completeTick("tick-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
      expect(status.activeRun).toBe(false);
    });

    it("ignores unknown tick IDs", () => {
      runtime.completeTick("nonexistent");
      // should not throw
    });
  });

  describe("runTick", () => {
    it("delegates to scheduler runTick", async () => {
      mockRunTick.mockResolvedValue({ ran: true });
      const result = await runtime.runTick();
      expect(result.ran).toBe(true);
      expect(mockRunTick).toHaveBeenCalled();
    });

    it("returns error when tick fails", async () => {
      mockRunTick.mockRejectedValue(new Error("tick failed"));
      await expect(runtime.runTick()).rejects.toThrow("tick failed");
    });
  });

  describe("getScheduledTasks", () => {
    it("returns mapped tasks from repository", async () => {
      mockGetRepositories.mockReturnValue({
        scheduledTasks: {
          getAll: vi.fn().mockResolvedValue([
            { id: "t1", name: "Test", cronExpr: "* * * * *", enabled: true, lastRun: null },
          ]),
        },
      });

      const tasks = await runtime.getScheduledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("t1");
      expect(tasks[0].name).toBe("Test");
      expect(tasks[0].lastRun).toBeUndefined();
    });
  });

  describe("shutdown", () => {
    it("cancels all active ticks and sets unhealthy", async () => {
      await runtime.startRun({ runId: "tick-1", input: {} });
      await runtime.shutdown({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });

      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
    });
  });

  describe("healthCheck", () => {
    it("sets health to healthy", async () => {
      const result = await runtime.healthCheck();
      expect(result).toBe(true);
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
    });
  });

  describe("start", () => {
    it("initializes the runtime", async () => {
      await runtime.start();
      const status = await runtime.getStatus();
      expect(status.health).toBe("healthy");
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Hono router", () => {
    it("GET /health returns status", async () => {
      const router = runtime.createRouter();
      await runtime.start();

      const res = await router.request("/health", { method: "GET" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("GET /runtime/status returns status", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/status", { method: "GET" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.kind).toBe("scheduler");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.capabilities).toContain("scheduler:tick");
    });

    it("POST /runtime/start-run starts a tick", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "tick-1", input: {} } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /runtime/cancel-run cancels a tick", async () => {
      const router = runtime.createRouter();
      await runtime.startRun({ runId: "tick-1", input: {} });

      const res = await router.request("/runtime/cancel-run", {
        method: "POST",
        body: { runId: "tick-1" } as any,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("cancelled");
    });

    it("POST /scheduler/tick runs a tick", async () => {
      mockRunTick.mockResolvedValue({ ran: true });
      const router = runtime.createRouter();

      const res = await router.request("/scheduler/tick", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ran).toBe(true);
    });

    it("GET /scheduler/tasks returns tasks", async () => {
      mockGetRepositories.mockReturnValue({
        scheduledTasks: {
          getAll: vi.fn().mockResolvedValue([]),
        },
      });
      const router = runtime.createRouter();

      const res = await router.request("/scheduler/tasks", { method: "GET" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tasks).toEqual([]);
    });

    it("POST /runtime/shutdown initiates shutdown", async () => {
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
});
