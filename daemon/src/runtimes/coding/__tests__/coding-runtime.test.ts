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
          param: (name: string) => {
            const match = path.match(new RegExp(`:${name}`));
            return match ? match[1] : "";
          },
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

const mockCreateCodingRun = vi.fn();
const mockListCodingRuntimes = vi.fn();
const mockGetCodingRuntime = vi.fn();
const mockCollectCodingArtifacts = vi.fn();

vi.mock("../registry.js", () => ({
  createCodingRun: (...args: unknown[]) => mockCreateCodingRun(...args),
  listCodingRuntimes: (...args: unknown[]) => mockListCodingRuntimes(...args),
  getCodingRuntime: (...args: unknown[]) => mockGetCodingRuntime(...args),
  collectCodingArtifacts: (...args: unknown[]) => mockCollectCodingArtifacts(...args),
}));

const {
  CodingRuntime,
  createCodingRuntime,
} = await import("../coding-runtime.js");

const baseConfig = {
  id: "test-coding",
  kind: "coding" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("CodingRuntime", () => {
  let runtime: InstanceType<typeof CodingRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new CodingRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createCodingRuntime(baseConfig);
      expect(instance).toBeInstanceOf(CodingRuntime);
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
      expect(typeof runtime.completeRun).toBe("function");
      expect(typeof runtime.createCodingRun).toBe("function");
      expect(typeof runtime.listAdapters).toBe("function");
      expect(typeof runtime.collectArtifacts).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns coding info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-coding");
      expect(info.kind).toBe("coding");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
    });
  });

  describe("getCapabilities", () => {
    it("returns coding-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("coding:create_run");
      expect(caps.capabilities).toContain("coding:cancel_run");
      expect(caps.capabilities).toContain("coding:stream_events");
      expect(caps.capabilities).toContain("coding:collect_artifacts");
      expect(caps.capabilities).toContain("coding:list_adapters");
      expect(caps.supportedEvents).toContain("coding:output");
      expect(caps.supportedEvents).toContain("coding:artifact");
    });

    it("uses default maxConcurrentRuns", () => {
      const caps = runtime.getCapabilities();
      expect(caps.maxConcurrentRuns).toBe(3);
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
    it("starts a coding run", async () => {
      const result = await runtime.startRun({
        runId: "crun-1",
        input: { adapterId: "claude-code" },
      });
      expect(result.status).toBe("started");
      expect(result.runId).toBe("crun-1");
    });

    it("rejects when max concurrent runs reached", async () => {
      await runtime.startRun({ runId: "crun-1", input: {} });
      await runtime.startRun({ runId: "crun-2", input: {} });
      await runtime.startRun({ runId: "crun-3", input: {} });

      const result = await runtime.startRun({ runId: "crun-4", input: {} });
      expect(result.status).toBe("rejected");
    });
  });

  describe("cancelRun", () => {
    it("cancels an active run", async () => {
      await runtime.startRun({ runId: "crun-1", input: {} });
      const result = await runtime.cancelRun({ runId: "crun-1" });
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown run", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("completeRun", () => {
    it("increments completedRuns counter", async () => {
      await runtime.startRun({ runId: "crun-1", input: {} });
      runtime.completeRun("crun-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
    });

    it("ignores unknown run IDs", () => {
      runtime.completeRun("nonexistent");
    });
  });

  describe("createCodingRun", () => {
    it("delegates to registry createCodingRun", async () => {
      mockCreateCodingRun.mockResolvedValue({
        runId: "run-1",
        status: "started",
      });

      const result = await runtime.createCodingRun("claude-code", {
        repoPath: "/repo",
        taskPrompt: "test task",
      });
      expect(result.runId).toBe("run-1");
      expect(mockCreateCodingRun).toHaveBeenCalledWith("claude-code", {
        repoPath: "/repo",
        taskPrompt: "test task",
      });
    });
  });

  describe("listAdapters", () => {
    it("returns adapters with availability", async () => {
      mockListCodingRuntimes.mockReturnValue([
        { id: "claude-code", name: "Claude Code" },
      ]);
      mockGetCodingRuntime.mockReturnValue({
        discover: vi.fn().mockResolvedValue({ available: true }),
      });

      const adapters = await runtime.listAdapters();
      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe("claude-code");
      expect(adapters[0].available).toBe(true);
    });

    it("marks unavailable adapters", async () => {
      mockListCodingRuntimes.mockReturnValue([
        { id: "codex", name: "Codex" },
      ]);
      mockGetCodingRuntime.mockReturnValue(null);

      const adapters = await runtime.listAdapters();
      expect(adapters[0].available).toBe(false);
    });
  });

  describe("collectArtifacts", () => {
    it("delegates to registry collectCodingArtifacts", async () => {
      mockCollectCodingArtifacts.mockResolvedValue([
        { type: "file", content: "test" },
      ]);

      const artifacts = await runtime.collectArtifacts("claude-code", "run-1");
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].type).toBe("file");
    });
  });

  describe("shutdown", () => {
    it("cancels all active runs and sets unhealthy", async () => {
      await runtime.startRun({ runId: "crun-1", input: {} });
      await runtime.startRun({ runId: "crun-2", input: {} });

      await runtime.shutdown({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });

      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
      expect(status.failedRuns).toBe(2);
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
    });
  });

  describe("Hono router", () => {
    it("GET /health returns ok", async () => {
      const router = runtime.createRouter();
      await runtime.start();

      const res = await router.request("/health", { method: "GET" });
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("GET /runtime/status returns status", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/status", { method: "GET" });
      const body = await res.json();
      expect(body.kind).toBe("coding");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      const body = await res.json();
      expect(body.capabilities).toContain("coding:create_run");
    });

    it("POST /runtime/start-run starts a run", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "crun-1", input: {} } as any,
      });
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /runtime/cancel-run cancels a run", async () => {
      const router = runtime.createRouter();
      await runtime.startRun({ runId: "crun-1", input: {} });

      const res = await router.request("/runtime/cancel-run", {
        method: "POST",
        body: { runId: "crun-1" } as any,
      });
      const body = await res.json();
      expect(body.status).toBe("cancelled");
    });

    it("POST /coding/start creates a coding run", async () => {
      mockCreateCodingRun.mockResolvedValue({
        runId: "run-1",
        status: "started",
      });
      const router = runtime.createRouter();

      const res = await router.request("/coding/start", {
        method: "POST",
        body: {
          adapterId: "claude-code",
          task: { repoPath: "/repo", taskPrompt: "test" },
        } as any,
      });
      expect(res.status).toBe(200);
    });

    it("GET /coding/adapters returns adapters", async () => {
      mockListCodingRuntimes.mockReturnValue([]);
      const router = runtime.createRouter();

      const res = await router.request("/coding/adapters", { method: "GET" });
      const body = await res.json();
      expect(body.adapters).toEqual([]);
    });

    it("POST /runtime/shutdown initiates shutdown", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/shutdown", {
        method: "POST",
        body: { status: "shutdown_initiated", timestamp: new Date().toISOString() } as any,
      });
      const body = await res.json();
      expect(body.status).toBe("shutdown_initiated");
    });
  });
});
