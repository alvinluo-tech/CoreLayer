import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock getRepositories
const mockQuery = vi.fn();
const mockCreate = vi.fn();
vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      query: mockQuery,
      create: mockCreate,
    },
  }),
}));

// Import after mocks
const { registerTaskFlowAdapter } = await import("../../gateways/mcp/adapters/taskflow.js");
const { registerFlexiLogAdapter } = await import("./flexilog.js");

describe("Adapter Registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["FLEXILOG_BASE_URL"];
    delete process.env["FLEXILOG_AUTH_TOKEN"];
  });

  it("registers TaskFlow tools without env vars", () => {
    const count = registerTaskFlowAdapter();
    expect(count).toBe(2);
  });

  it("skips FlexiLog when FLEXILOG_BASE_URL not set", () => {
    const count = registerFlexiLogAdapter();
    expect(count).toBe(0);
  });

  it("registers FlexiLog tools when env is set", () => {
    process.env["FLEXILOG_BASE_URL"] = "http://localhost:3001";
    const count = registerFlexiLogAdapter();
    expect(count).toBe(4);
  });
});

describe("TaskFlow Adapter — Repository Pattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list_tasks calls repos.query with correct filters", async () => {
    const mockTasks = [{ id: "1", title: "Test" }];
    mockQuery.mockResolvedValue(mockTasks);

    const { registerTaskFlowAdapter: register } = await import("../../gateways/mcp/adapters/taskflow.js");
    const { getRegistry } = await import("../../runtimes/tool/adapters/native-tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("native:taskflow_list_tasks");
    expect(tool).toBeDefined();

    const result = await tool!.execute({ status: "pending", priority: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ tasks: mockTasks, count: 1 });
    expect(mockQuery).toHaveBeenCalledWith({ status: "pending", priority: 3 });
  });

  it("create_task passes correct params to repo", async () => {
    const mockTask = { id: "new-1", title: "New Task" };
    mockCreate.mockResolvedValue(mockTask);

    const { registerTaskFlowAdapter: register } = await import("../../gateways/mcp/adapters/taskflow.js");
    const { getRegistry } = await import("../../runtimes/tool/adapters/native-tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("native:taskflow_create_task");
    expect(tool).toBeDefined();

    const result = await tool!.execute({
      title: "New Task",
      priority: 5,
      dueDate: "2026-06-01",
      tags: ["work"],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ task: mockTask });
    expect(mockCreate).toHaveBeenCalledWith({
      title: "New Task",
      priority: 5,
      dueDate: "2026-06-01",
      tags: ["work"],
      description: null,
    });
  });

  it("create_task uses defaults for optional fields", async () => {
    mockCreate.mockResolvedValue({ id: "1", title: "Minimal" });

    const { registerTaskFlowAdapter: register } = await import("../../gateways/mcp/adapters/taskflow.js");
    const { getRegistry } = await import("../../runtimes/tool/adapters/native-tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("native:taskflow_create_task");
    expect(tool).toBeDefined();

    await tool!.execute({ title: "Minimal" });

    expect(mockCreate).toHaveBeenCalledWith({
      title: "Minimal",
      priority: 3,
      dueDate: null,
      tags: [],
      description: null,
    });
  });

  it("returns error when repo throws", async () => {
    mockQuery.mockRejectedValue(new Error("DB connection failed"));

    const { registerTaskFlowAdapter: register } = await import("../../gateways/mcp/adapters/taskflow.js");
    const { getRegistry } = await import("../../runtimes/tool/adapters/native-tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("native:taskflow_list_tasks");
    expect(tool).toBeDefined();

    const result = await tool!.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection failed");
  });
});

describe("REST Adapter — Fetch Pattern (FlexiLog)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["FLEXILOG_BASE_URL"] = "http://flexilog.local";
  });

  afterEach(() => {
    delete process.env["FLEXILOG_BASE_URL"];
  });

  it("log_workout sends POST with exercise data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "w1" }),
    });

    const input = {
      exercises: [{ exerciseId: "squat", sets: [{ reps: 10, weight: 100 }] }],
      duration: 60,
    };

    await fetch("http://flexilog.local/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://flexilog.local/api/workouts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });

  it("get_history sends GET with pagination params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const params = new URLSearchParams({ limit: "5", offset: "10" });
    await fetch(`http://flexilog.local/api/workouts?${params}`, { method: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://flexilog.local/api/workouts?limit=5&offset=10",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
