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

    async request(path: string, init?: { method?: string; body?: unknown }) {
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

vi.mock("@jarvis/runtime-protocol", () => ({
  isApprovalRequiredResult: (result: unknown) =>
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>).kind === "approval_required",
}));

const mockExecute = vi.fn();
const mockGetRegistry = vi.fn();

vi.mock("../application/execute-tool.js", () => ({
  ToolExecutionService: vi.fn().mockImplementation(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

vi.mock("../adapters/native-tools/registry.js", () => ({
  getRegistry: (...args: unknown[]) => mockGetRegistry(...args),
}));

const {
  ToolRuntime,
  createToolRuntime,
} = await import("../tool-runtime.js");

const baseConfig = {
  id: "test-tool",
  kind: "tool" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("ToolRuntime", () => {
  let runtime: InstanceType<typeof ToolRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new ToolRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createToolRuntime(baseConfig);
      expect(instance).toBeInstanceOf(ToolRuntime);
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
      expect(typeof runtime.completeExecution).toBe("function");
      expect(typeof runtime.executeTool).toBe("function");
      expect(typeof runtime.listTools).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns tool info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-tool");
      expect(info.kind).toBe("tool");
      expect(info.version).toBe("1.0.0");
    });
  });

  describe("getCapabilities", () => {
    it("returns tool-specific capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("tool:execute");
      expect(caps.capabilities).toContain("tool:list");
      expect(caps.capabilities).toContain("tool:register");
      expect(caps.capabilities).toContain("tool:validate");
      expect(caps.capabilities).toContain("permission:check");
      expect(caps.capabilities).toContain("permission:approve");
      expect(caps.supportedEvents).toContain("tool:executing");
      expect(caps.supportedEvents).toContain("tool:completed");
      expect(caps.supportedEvents).toContain("tool:failed");
      expect(caps.maxConcurrentRuns).toBe(10);
    });

    it("respects custom maxConcurrentExecutions", () => {
      const custom = new ToolRuntime({
        ...baseConfig,
        maxConcurrentExecutions: 5,
      });
      const caps = custom.getCapabilities();
      expect(caps.maxConcurrentRuns).toBe(5);
    });
  });

  describe("getStatus", () => {
    it("returns zero uptime before start", async () => {
      const status = await runtime.getStatus();
      expect(status.uptime).toBe(0);
      expect(status.activeRun).toBe(false);
    });
  });

  describe("startRun", () => {
    it("starts a tool execution", async () => {
      const result = await runtime.startRun({
        runId: "exec-1",
        input: { toolId: "todo.create" },
      });
      expect(result.status).toBe("started");
      expect(result.runId).toBe("exec-1");
    });

    it("rejects when max concurrent executions reached", async () => {
      for (let i = 0; i < 10; i++) {
        await runtime.startRun({ runId: `exec-${i}`, input: {} });
      }
      const result = await runtime.startRun({ runId: "exec-10", input: {} });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("Max concurrent executions reached");
    });
  });

  describe("cancelRun", () => {
    it("cancels an active execution", async () => {
      await runtime.startRun({ runId: "exec-1", input: {} });
      const result = await runtime.cancelRun({ runId: "exec-1" });
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown execution", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("completeExecution", () => {
    it("increments completedExecutions counter", async () => {
      await runtime.startRun({ runId: "exec-1", input: {} });
      runtime.completeExecution("exec-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
      expect(status.activeRun).toBe(false);
    });

    it("ignores unknown execution IDs", () => {
      runtime.completeExecution("nonexistent");
    });
  });

  describe("executeTool", () => {
    it("delegates to ToolExecutionService", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: { output: "done" },
      });

      const result = await runtime.executeTool(
        "todo.create",
        { title: "Test" },
        { caller: "test" },
      );
      expect(result).toEqual({ output: "done" });
      expect(mockExecute).toHaveBeenCalled();
    });

    it("returns error when approval is required", async () => {
      mockExecute.mockResolvedValue({
        kind: "approval_required",
        approvalRequestId: "appr-1",
      });

      const result = await runtime.executeTool(
        "todo.create",
        { title: "Test" },
        { caller: "test" },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Approval required");
    });
  });

  describe("listTools", () => {
    it("returns mapped tools from registry", async () => {
      mockGetRegistry.mockReturnValue({
        getAllTools: vi.fn().mockReturnValue([
          { id: "todo.create", name: "Create Todo", description: "Creates a todo", risk: "low" },
        ]),
      });

      const tools = await runtime.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].id).toBe("todo.create");
      expect(tools[0].risk).toBe("low");
    });
  });

  describe("shutdown", () => {
    it("cancels all active executions and sets unhealthy", async () => {
      await runtime.startRun({ runId: "exec-1", input: {} });
      await runtime.startRun({ runId: "exec-2", input: {} });

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
    it("GET /health returns ok when started", async () => {
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
      expect(body.kind).toBe("tool");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      const body = await res.json();
      expect(body.capabilities).toContain("tool:execute");
    });

    it("POST /runtime/start-run starts an execution", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "exec-1", input: { toolId: "test" } },
      });
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /runtime/cancel-run cancels an execution", async () => {
      const router = runtime.createRouter();
      await runtime.startRun({ runId: "exec-1", input: {} });

      const res = await router.request("/runtime/cancel-run", {
        method: "POST",
        body: { runId: "exec-1" },
      });
      const body = await res.json();
      expect(body.status).toBe("cancelled");
    });

    it("POST /tools/execute executes a tool", async () => {
      mockExecute.mockResolvedValue({
        success: true,
        result: { output: "done" },
      });
      const router = runtime.createRouter();

      const res = await router.request("/tools/execute", {
        method: "POST",
        body: {
          toolId: "todo.create",
          args: { title: "Test" },
          context: { caller: "rest-api" },
        },
      });
      expect(res.status).toBe(200);
    });

    it("GET /tools/list returns tools", async () => {
      mockGetRegistry.mockReturnValue({
        getAllTools: vi.fn().mockReturnValue([]),
      });
      const router = runtime.createRouter();

      const res = await router.request("/tools/list", { method: "GET" });
      const body = await res.json();
      expect(body.tools).toEqual([]);
    });

    it("POST /runtime/shutdown initiates shutdown", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/shutdown", {
        method: "POST",
        body: { status: "shutdown_initiated", timestamp: new Date().toISOString() },
      });
      const body = await res.json();
      expect(body.status).toBe("shutdown_initiated");
    });
  });
});
