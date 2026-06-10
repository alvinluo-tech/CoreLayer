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

      const queryParams: Record<string, string> = {};
      if (path.includes("?")) {
        const search = path.split("?")[1];
        for (const pair of search.split("&")) {
          const [key, value] = pair.split("=");
          queryParams[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
        }
      }

      const c = {
        req: {
          json: async <T = unknown>(): Promise<T> => bodyData as T,
          query: (name: string) => queryParams[name],
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

const mockRequestComputerControl = vi.fn();
const mockGetPermissionStatuses = vi.fn();
const mockGetComputerControlStatus = vi.fn();

vi.mock("../computer-control-runtime.js", () => ({
  requestComputerControl: (...args: unknown[]) => mockRequestComputerControl(...args),
  getPermissionStatuses: (...args: unknown[]) => mockGetPermissionStatuses(...args),
  getComputerControlStatus: (...args: unknown[]) => mockGetComputerControlStatus(...args),
}));

const mockBrokerRequestCapability = vi.fn();
vi.mock("../../../capabilities/os-capability-broker.js", () => ({
  getCapabilityBroker: () => ({
    requestCapability: (...args: unknown[]) => mockBrokerRequestCapability(...args),
  }),
}));

const {
  ComputerControlRuntime,
  createComputerControlRuntime,
} = await import("../computer-control-runtime-facade.js");

const baseConfig = {
  id: "test-cc",
  kind: "computer-control" as const,
  version: "1.0.0",
  appDataPath: "/tmp/test-data",
  logPath: "/tmp/test-logs",
};

describe("ComputerControlRuntime (facade)", () => {
  let runtime: InstanceType<typeof ComputerControlRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new ComputerControlRuntime(baseConfig);
  });

  describe("class interface", () => {
    it("creates via factory function", () => {
      const instance = createComputerControlRuntime(baseConfig);
      expect(instance).toBeInstanceOf(ComputerControlRuntime);
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
      expect(typeof runtime.requestControl).toBe("function");
      expect(typeof runtime.screenshot).toBe("function");
      expect(typeof runtime.listWindows).toBe("function");
      expect(typeof runtime.focusWindow).toBe("function");
      expect(typeof runtime.click).toBe("function");
      expect(typeof runtime.typeText).toBe("function");
      expect(typeof runtime.clipboardRead).toBe("function");
      expect(typeof runtime.clipboardWrite).toBe("function");
      expect(typeof runtime.getPermissionStatuses).toBe("function");
      expect(typeof runtime.getControlStatus).toBe("function");
    });
  });

  describe("getInfo", () => {
    it("returns computer-control info", () => {
      const info = runtime.getInfo();
      expect(info.id).toBe("test-cc");
      expect(info.kind).toBe("computer-control");
      expect(info.version).toBe("1.0.0");
      expect(info.protocolVersion).toBe(1);
    });
  });

  describe("getCapabilities", () => {
    it("returns computer-control capabilities", () => {
      const caps = runtime.getCapabilities();
      expect(caps.capabilities).toContain("computer:screenshot");
      expect(caps.capabilities).toContain("computer:window_list");
      expect(caps.capabilities).toContain("computer:click");
      expect(caps.capabilities).toContain("computer:type_text");
      expect(caps.capabilities).toContain("computer:clipboard_read");
      expect(caps.capabilities).toContain("computer:clipboard_write");
      expect(caps.supportedEvents).toContain("computer:screenshot_captured");
      expect(caps.maxConcurrentRuns).toBe(1);
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
    it("starts a control run", async () => {
      const result = await runtime.startRun({
        runId: "ctrl-1",
        input: { operation: "screenshot" },
      });
      expect(result.status).toBe("started");
    });

    it("rejects when operation already in progress", async () => {
      await runtime.startRun({ runId: "ctrl-1", input: { operation: "click" } });
      const result = await runtime.startRun({
        runId: "ctrl-2",
        input: { operation: "type_text" },
      });
      expect(result.status).toBe("rejected");
    });
  });

  describe("cancelRun", () => {
    it("cancels an active run", async () => {
      await runtime.startRun({ runId: "ctrl-1", input: {} });
      const result = await runtime.cancelRun({ runId: "ctrl-1" });
      expect(result.status).toBe("cancelled");
    });

    it("returns not_found for unknown run", async () => {
      const result = await runtime.cancelRun({ runId: "unknown" });
      expect(result.status).toBe("not_found");
    });
  });

  describe("completeRun", () => {
    it("increments completedRuns counter", async () => {
      await runtime.startRun({ runId: "ctrl-1", input: {} });
      runtime.completeRun("ctrl-1");

      const status = await runtime.getStatus();
      expect(status.completedRuns).toBe(1);
    });

    it("ignores unknown run IDs", () => {
      runtime.completeRun("nonexistent");
    });
  });

  describe("requestControl", () => {
    it("delegates to requestComputerControl", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });

      const result = await runtime.requestControl({
        actorId: "agent-1",
        operation: "click",
        coordinates: { x: 100, y: 200 },
      });
      expect(result).toEqual({ success: true });
      expect(mockRequestComputerControl).toHaveBeenCalled();
    });
  });

  describe("screenshot", () => {
    it("calls requestControl with screenshot operation", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });

      await runtime.screenshot("agent-1");
      expect(mockRequestComputerControl).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "agent-1",
          operation: "screenshot",
        }),
      );
    });
  });

  describe("listWindows", () => {
    it("calls requestControl with window.list operation", async () => {
      mockRequestComputerControl.mockResolvedValue({ windows: [] });

      await runtime.listWindows("agent-1");
      expect(mockRequestComputerControl).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "window.list",
        }),
      );
    });
  });

  describe("focusWindow", () => {
    it("calls requestControl with window.focus operation", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });

      await runtime.focusWindow("agent-1", "win-1");
      expect(mockRequestComputerControl).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "window.focus",
          windowId: "win-1",
        }),
      );
    });
  });

  describe("click", () => {
    it("calls requestControl with click operation", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });

      await runtime.click("agent-1", { x: 50, y: 100 });
      expect(mockRequestComputerControl).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "click",
          coordinates: { x: 50, y: 100 },
        }),
      );
    });
  });

  describe("typeText", () => {
    it("calls requestControl with type_text operation", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });

      await runtime.typeText("agent-1", "hello");
      expect(mockRequestComputerControl).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "type_text",
          text: "hello",
        }),
      );
    });
  });

  describe("clipboardRead", () => {
    it("requests capability via broker", async () => {
      mockBrokerRequestCapability.mockResolvedValue({ decision: "allow" });

      const result = await runtime.clipboardRead();
      expect(result).toEqual({ decision: "allow" });
      expect(mockBrokerRequestCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "window.control",
          resource: "clipboard:read",
        }),
      );
    });
  });

  describe("clipboardWrite", () => {
    it("requests capability and returns text", async () => {
      mockBrokerRequestCapability.mockResolvedValue({ decision: "allow" });

      const result = await runtime.clipboardWrite("agent-1", "test text");
      expect(result).toEqual({ decision: "allow", text: "test text" });
      expect(mockBrokerRequestCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: "window.control",
          resource: "clipboard:write",
          riskLevel: "high",
        }),
      );
    });
  });

  describe("getPermissionStatuses", () => {
    it("delegates to computer-control-runtime", async () => {
      mockGetPermissionStatuses.mockResolvedValue([{ operation: "click" }]);

      const result = await runtime.getPermissionStatuses();
      expect(result).toEqual([{ operation: "click" }]);
    });
  });

  describe("getControlStatus", () => {
    it("delegates to computer-control-runtime", async () => {
      mockGetComputerControlStatus.mockResolvedValue({ totalRequests: 5 });

      const result = await runtime.getControlStatus();
      expect(result).toEqual({ totalRequests: 5 });
    });
  });

  describe("shutdown", () => {
    it("cancels all active runs and sets unhealthy", async () => {
      await runtime.startRun({ runId: "ctrl-1", input: {} });
      await runtime.shutdown({
        status: "shutdown_initiated",
        timestamp: new Date().toISOString(),
      });

      const status = await runtime.getStatus();
      expect(status.health).toBe("unhealthy");
      expect(status.failedRuns).toBe(1);
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
      expect(body.kind).toBe("computer-control");
    });

    it("GET /runtime/capabilities returns capabilities", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/capabilities", {
        method: "GET",
      });
      const body = await res.json();
      expect(body.capabilities).toContain("computer:screenshot");
    });

    it("POST /computer/control delegates to requestControl", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });
      const router = runtime.createRouter();

      const res = await router.request("/computer/control", {
        method: "POST",
        body: {
          actorId: "agent-1",
          operation: "click",
          coordinates: { x: 100, y: 200 },
        },
      });
      expect(res.status).toBe(200);
    });

    it("POST /computer/screenshot calls screenshot", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });
      const router = runtime.createRouter();

      const res = await router.request("/computer/screenshot", {
        method: "POST",
        body: { actorId: "agent-1" },
      });
      expect(res.status).toBe(200);
    });

    it("GET /computer/clipboard/read reads clipboard", async () => {
      mockBrokerRequestCapability.mockResolvedValue({ decision: "allow" });
      const router = runtime.createRouter();

      const res = await router.request("/computer/clipboard/read", {
        method: "GET",
      });
      expect(res.status).toBe(200);
    });

    it("POST /computer/clipboard/write writes clipboard", async () => {
      mockBrokerRequestCapability.mockResolvedValue({ decision: "allow" });
      const router = runtime.createRouter();

      const res = await router.request("/computer/clipboard/write", {
        method: "POST",
        body: { actorId: "agent-1", text: "hello" },
      });
      expect(res.status).toBe(200);
    });

    it("GET /computer/permissions returns permission statuses", async () => {
      mockGetPermissionStatuses.mockResolvedValue([]);
      const router = runtime.createRouter();

      const res = await router.request("/computer/permissions", {
        method: "GET",
      });
      expect(res.status).toBe(200);
    });

    it("GET /computer/status returns control status", async () => {
      mockGetComputerControlStatus.mockResolvedValue({ totalRequests: 0 });
      const router = runtime.createRouter();

      const res = await router.request("/computer/status", {
        method: "GET",
      });
      expect(res.status).toBe(200);
    });

    it("POST /runtime/start-run starts a control run", async () => {
      const router = runtime.createRouter();

      const res = await router.request("/runtime/start-run", {
        method: "POST",
        body: { runId: "ctrl-1", input: { operation: "screenshot" } },
      });
      const body = await res.json();
      expect(body.status).toBe("started");
    });

    it("POST /runtime/cancel-run cancels a run", async () => {
      const router = runtime.createRouter();
      await runtime.startRun({ runId: "ctrl-1", input: {} });

      const res = await router.request("/runtime/cancel-run", {
        method: "POST",
        body: { runId: "ctrl-1" },
      });
      const body = await res.json();
      expect(body.status).toBe("cancelled");
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

    it("POST /computer/input/click clicks at coordinates", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });
      const router = runtime.createRouter();

      const res = await router.request("/computer/input/click", {
        method: "POST",
        body: { actorId: "agent-1", coordinates: { x: 50, y: 100 } },
      });
      expect(res.status).toBe(200);
    });

    it("POST /computer/input/type types text", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });
      const router = runtime.createRouter();

      const res = await router.request("/computer/input/type", {
        method: "POST",
        body: { actorId: "agent-1", text: "hello" },
      });
      expect(res.status).toBe(200);
    });

    it("GET /computer/windows lists windows", async () => {
      mockRequestComputerControl.mockResolvedValue({ windows: [] });
      const router = runtime.createRouter();

      const res = await router.request("/computer/windows", {
        method: "GET",
      });
      expect(res.status).toBe(200);
    });

    it("POST /computer/window/focus focuses a window", async () => {
      mockRequestComputerControl.mockResolvedValue({ success: true });
      const router = runtime.createRouter();

      const res = await router.request("/computer/window/focus", {
        method: "POST",
        body: { actorId: "agent-1", windowId: "win-1" },
      });
      expect(res.status).toBe(200);
    });
  });
});
