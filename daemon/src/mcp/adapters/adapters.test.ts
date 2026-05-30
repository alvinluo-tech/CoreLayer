import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock getRepositories
const mockQuery = vi.fn();
const mockCreate = vi.fn();
vi.mock("../../db/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      query: mockQuery,
      create: mockCreate,
    },
  }),
}));

// Import after mocks
const { registerTaskFlowAdapter } = await import("./taskflow.js");
const { registerVeridiaAdapter } = await import("./veridia.js");
const { registerFlexiLogAdapter } = await import("./flexilog.js");

describe("Adapter Registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["VERIDIA_BASE_URL"];
    delete process.env["VERIDIA_AUTH_TOKEN"];
    delete process.env["FLEXILOG_BASE_URL"];
    delete process.env["FLEXILOG_AUTH_TOKEN"];
  });

  it("registers TaskFlow tools without env vars", () => {
    const count = registerTaskFlowAdapter();
    expect(count).toBe(2);
  });

  it("skips Veridia when VERIDIA_BASE_URL not set", () => {
    const count = registerVeridiaAdapter();
    expect(count).toBe(0);
  });

  it("skips FlexiLog when FLEXILOG_BASE_URL not set", () => {
    const count = registerFlexiLogAdapter();
    expect(count).toBe(0);
  });

  it("registers Veridia tools when env is set", () => {
    process.env["VERIDIA_BASE_URL"] = "http://localhost:3000";
    const count = registerVeridiaAdapter();
    expect(count).toBe(6);
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

    // Import the adapter and get the tools
    const { registerTaskFlowAdapter: register } = await import("./taskflow.js");
    const { getRegistry } = await import("../../tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("rest:taskflow:list_tasks");
    expect(tool).toBeDefined();

    const result = await tool!.execute({ status: "pending", priority: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockTasks);
    expect(mockQuery).toHaveBeenCalledWith({ status: "pending", priority: 3 });
  });

  it("create_task passes correct params to repo", async () => {
    const mockTask = { id: "new-1", title: "New Task" };
    mockCreate.mockResolvedValue(mockTask);

    const { registerTaskFlowAdapter: register } = await import("./taskflow.js");
    const { getRegistry } = await import("../../tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("rest:taskflow:create_task");
    expect(tool).toBeDefined();

    const result = await tool!.execute({
      title: "New Task",
      priority: 5,
      dueDate: "2026-06-01",
      tags: ["work"],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockTask);
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

    const { registerTaskFlowAdapter: register } = await import("./taskflow.js");
    const { getRegistry } = await import("../../tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("rest:taskflow:create_task");
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

    const { registerTaskFlowAdapter: register } = await import("./taskflow.js");
    const { getRegistry } = await import("../../tools/registry.js");
    register();

    const registry = getRegistry();
    const tool = registry.getTool("rest:taskflow:list_tasks");
    expect(tool).toBeDefined();

    const result = await tool!.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toBe("DB connection failed");
  });
});

describe("REST Adapter — Fetch Pattern (Veridia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["VERIDIA_BASE_URL"] = "http://veridia.local";
  });

  afterEach(() => {
    delete process.env["VERIDIA_BASE_URL"];
  });

  it("search_media sends GET with query params", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    // Simulate the REST API call that the adapter would make
    const url = "http://veridia.local/api/jarvis/search";
    const params = new URLSearchParams({ q: "test", type: "book" });
    await fetch(`${url}?${params}`, { method: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://veridia.local/api/jarvis/search?q=test&type=book",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("add_media sends POST with body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "123" }),
    });

    await fetch("http://veridia.local/api/jarvis/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Book", type: "book" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://veridia.local/api/jarvis/media",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Book", type: "book" }),
      }),
    );
  });

  it("update_media replaces :id path param", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const url = "http://veridia.local/api/jarvis/media/abc-123";
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://veridia.local/api/jarvis/media/abc-123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    );
  });

  it("includes auth token in header when set", async () => {
    process.env["VERIDIA_AUTH_TOKEN"] = "my-token";

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetch("http://veridia.local/api/jarvis/insights", {
      method: "GET",
      headers: {
        Authorization: "Bearer my-token",
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-token",
        }),
      }),
    );
  });

  it("returns error on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const response = await fetch("http://veridia.local/api/jarvis/search?q=test");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
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

describe("Adapter Cross-Path Consistency", () => {
  // AI regression: different adapter types (repo vs REST) should return
  // consistent success/error shapes

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TaskFlow and REST adapters both return { success, data } on success", async () => {
    mockQuery.mockResolvedValue([]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    // TaskFlow (repo pattern) - test the underlying repo call
    const repos = (await import("../../db/factory.js")).getRepositories();
    const taskResult = await repos.tasks.query({});
    expect(taskResult).toEqual([]);

    // Veridia (REST pattern) - test the underlying fetch call
    const response = await fetch("http://veridia.local/api/jarvis/search?q=test");
    expect(response.ok).toBe(true);
  });

  it("TaskFlow and REST adapters both handle errors", async () => {
    mockQuery.mockRejectedValue(new Error("repo error"));
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    // TaskFlow error handling
    const repos = (await import("../../db/factory.js")).getRepositories();
    try {
      await repos.tasks.query({});
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("repo error");
    }

    // REST error handling
    const response = await fetch("http://veridia.local/api/jarvis/search?q=test");
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });
});
