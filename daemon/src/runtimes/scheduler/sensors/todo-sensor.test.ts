import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryTasks = vi.fn();

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      query: mockQueryTasks,
    },
  }),
}));

vi.mock("../../../workspaces/task-status.js", () => ({
  isTaskComplete: (status: string) => status === "completed" || status === "done",
}));

const { createTodoSensor } = await import("./todo-sensor.js");

describe("todo-sensor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and default interval", () => {
    const sensor = createTodoSensor();
    expect(sensor.name).toBe("todo");
    expect(sensor.interval).toBe(60_000);
  });

  it("uses custom interval", () => {
    const sensor = createTodoSensor({ intervalMs: 5000 });
    expect(sensor.interval).toBe(5000);
  });

  it("returns null on first check (initialization)", async () => {
    mockQueryTasks.mockResolvedValue([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    const sensor = createTodoSensor();

    const changes = await sensor.check();
    expect(changes).toBeNull();
  });

  it("returns null when no changes detected", async () => {
    const tasks = [
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ];
    mockQueryTasks.mockResolvedValue(tasks);
    const sensor = createTodoSensor();

    await sensor.check(); // initialize
    const changes = await sensor.check(); // same data

    expect(changes).toBeNull();
  });

  it("detects new tasks", async () => {
    const sensor = createTodoSensor();

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    await sensor.check(); // initialize

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
      { id: "2", title: "Task 2", status: "pending", priority: 3, dueDate: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "todo_added", detail: "New task: Task 2 (priority 3)" },
    ]);
  });

  it("detects task completion", async () => {
    const sensor = createTodoSensor();

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    await sensor.check(); // initialize

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "done", priority: 1, dueDate: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "todo_completed", detail: "Completed: Task 1" },
    ]);
  });

  it("detects generic status change", async () => {
    const sensor = createTodoSensor();

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    await sensor.check(); // initialize

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "in_progress", priority: 1, dueDate: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toEqual([
      { type: "todo_status_changed", detail: 'Task "Task 1" status: pending → in_progress' },
    ]);
  });

  it("detects overdue tasks when snapshot changes", async () => {
    const sensor = createTodoSensor();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: yesterdayStr },
    ]);
    await sensor.check(); // initialize

    // Add a new task to trigger snapshot change, while Task 1 remains overdue
    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: yesterdayStr },
      { id: "2", title: "Task 2", status: "pending", priority: 3, dueDate: null },
    ]);
    const changes = await sensor.check();

    expect(changes).toContainEqual(
      expect.objectContaining({ type: "todo_overdue" }),
    );
  });

  it("does not flag completed tasks as overdue", async () => {
    const sensor = createTodoSensor();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "done", priority: 1, dueDate: yesterdayStr },
    ]);
    await sensor.check(); // initialize

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "done", priority: 1, dueDate: yesterdayStr },
    ]);
    const changes = await sensor.check();

    expect(changes).toBeNull();
  });

  it("filters out deleted tasks from snapshot", async () => {
    const sensor = createTodoSensor();

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
      { id: "2", title: "Deleted Task", status: "deleted", priority: 1, dueDate: null },
    ]);
    await sensor.check(); // initialize

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    const changes = await sensor.check();

    // Deleted task removal should not trigger changes
    expect(changes).toBeNull();
  });

  it("returns null when repository throws", async () => {
    mockQueryTasks.mockRejectedValue(new Error("DB error"));
    const sensor = createTodoSensor();

    const changes = await sensor.check();
    expect(changes).toBeNull();
  });

  it("detects multiple changes at once", async () => {
    const sensor = createTodoSensor();

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "pending", priority: 1, dueDate: null },
    ]);
    await sensor.check(); // initialize

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    mockQueryTasks.mockResolvedValueOnce([
      { id: "1", title: "Task 1", status: "done", priority: 1, dueDate: null },
      { id: "2", title: "Task 2", status: "pending", priority: 2, dueDate: yesterdayStr },
    ]);
    const changes = await sensor.check();

    // 3 changes: completed (Task 1), added (Task 2), overdue (Task 2)
    expect(changes).toHaveLength(3);
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "todo_completed" }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "todo_added" }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "todo_overdue" }),
    );
  });
});
