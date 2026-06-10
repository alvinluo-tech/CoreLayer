import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockLogError,
  mockEnv,
  mockResolveAppPaths,
  mockGetCurrentMode,
  mockRegisterRoutes,
  mockGetRuntimeInstances,
} = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockEnv: {
    AI_PROVIDER: "mimo",
    AI_MODEL: "mimo-v2.5-pro",
    DAEMON_PORT: 3001,
    JARVIS_RUNTIME_MODE: "dev",
  },
  mockResolveAppPaths: vi.fn(),
  mockGetCurrentMode: vi.fn(),
  mockRegisterRoutes: vi.fn(),
  mockGetRuntimeInstances: vi.fn(),
}));

vi.mock("../shared/errors.js", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}));

vi.mock("../config/env.js", () => ({
  env: mockEnv,
}));

vi.mock("../config/app-paths.js", () => ({
  resolveAppPaths: (...args: unknown[]) => mockResolveAppPaths(...args),
}));

vi.mock("../persistence/factory.js", () => ({
  getCurrentMode: (...args: unknown[]) => mockGetCurrentMode(...args),
}));

vi.mock("./register-routes.js", () => ({
  registerRoutes: (...args: unknown[]) => mockRegisterRoutes(...args),
}));

vi.mock("../runtime-host/registry.js", () => ({
  getRuntimeInstances: (...args: unknown[]) => mockGetRuntimeInstances(...args),
}));

const { createHttpApp } = await import("./create-http-app.js");

describe("createHttpApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentMode.mockReturnValue("local");
    mockResolveAppPaths.mockReturnValue({
      appDataDir: "/tmp/test",
      sqlitePath: "/tmp/test/data/jarvis.db",
      logDir: "/tmp/test/logs",
    });
    mockGetRuntimeInstances.mockReturnValue(new Map());
  });

  it("creates a Hono app with routes registered", () => {
    const app = createHttpApp();

    expect(app).toBeDefined();
    expect(mockRegisterRoutes).toHaveBeenCalledWith(app);
  });

  it("health endpoint returns status ok", async () => {
    const app = createHttpApp();

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.aiProvider).toBe("mimo");
    expect(body.aiModel).toBe("mimo-v2.5-pro");
    expect(body.storageMode).toBe("local");
  });

  it("/health endpoint returns status ok", async () => {
    const app = createHttpApp();

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("returns 404 for unknown routes", async () => {
    const app = createHttpApp();

    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Route not found");
  });

  it("runtime status endpoint returns registered runtimes", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "healthy", lastError: undefined }),
    };
    mockGetRuntimeInstances.mockReturnValue(new Map([["agent", mockRuntime]]));

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.registeredRuntimes).toHaveLength(1);
    expect(body.registeredRuntimes[0].kind).toBe("agent");
    expect(body.registeredRuntimes[0].status).toBe("running");
  });

  it("runtime status handles degraded health", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "degraded", lastError: "slow" }),
    };
    mockGetRuntimeInstances.mockReturnValue(new Map([["voice", mockRuntime]]));

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.registeredRuntimes[0].status).toBe("degraded");
    expect(body.registeredRuntimes[0].lastError).toBe("slow");
  });

  it("runtime status handles failed health", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockResolvedValue({ health: "failed", lastError: "crash" }),
    };
    mockGetRuntimeInstances.mockReturnValue(new Map([["coding", mockRuntime]]));

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.registeredRuntimes[0].status).toBe("failed");
  });

  it("runtime status handles getStatus throwing an error", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockRejectedValue(new Error("connection refused")),
    };
    mockGetRuntimeInstances.mockReturnValue(new Map([["tool", mockRuntime]]));

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.registeredRuntimes[0].status).toBe("failed");
    expect(body.registeredRuntimes[0].lastError).toBe("connection refused");
  });

  it("runtime status handles non-Error thrown values", async () => {
    const mockRuntime = {
      getStatus: vi.fn().mockRejectedValue("string error"),
    };
    mockGetRuntimeInstances.mockReturnValue(new Map([["scheduler", mockRuntime]]));

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.registeredRuntimes[0].lastError).toBe("string error");
  });

  it("runtime status includes paths and metadata", async () => {
    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.paths).toBeDefined();
    expect(body.paths.appDataDir).toBe("/tmp/test");
    expect(body.paths.sqlitePath).toBe("/tmp/test/data/jarvis.db");
    expect(body.paths.logDir).toBe("/tmp/test/logs");
    expect(body.pid).toBe(process.pid);
    expect(body.runtimeMode).toBe("dev");
  });

  it("runtime status with empty runtime map returns empty array", async () => {
    mockGetRuntimeInstances.mockReturnValue(new Map());

    const app = createHttpApp();

    const res = await app.request("/api/runtime/status");
    const body = await res.json();

    expect(body.registeredRuntimes).toEqual([]);
  });
});
