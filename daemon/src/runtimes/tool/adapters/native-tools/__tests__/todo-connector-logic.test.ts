import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture registered tools
const registeredTools = new Map<string, unknown>();

vi.mock("../registry.js", () => ({
  registerTool: vi.fn((name: string, toolDef: unknown) => {
    registeredTools.set(name, toolDef);
  }),
}));

const mockCreateTask = vi.fn();
const mockGetTodayTasks = vi.fn();
const mockQueryTasks = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();

vi.mock("../../../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      create: mockCreateTask,
      getTodayTasks: mockGetTodayTasks,
      query: mockQueryTasks,
      update: mockUpdateTask,
      delete: mockDeleteTask,
    },
  }),
}));

const { registerTodoTools } = await import("../todo/connector.js");

function getToolExecute(name: string): (...args: unknown[]) => Promise<unknown> {
  const tool = registeredTools.get(name) as { execute: (...args: unknown[]) => Promise<unknown> };
  return tool.execute;
}

describe("todo-connector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools.clear();
    registerTodoTools();
  });

  it("registers all todo tools", () => {
    expect(registeredTools.has("createTask")).toBe(true);
    expect(registeredTools.has("getTodayTasks")).toBe(true);
    expect(registeredTools.has("queryTasks")).toBe(true);
    expect(registeredTools.has("updateTask")).toBe(true);
    expect(registeredTools.has("deleteTask")).toBe(true);
  });

  describe("createTask", () => {
    it("creates a task with provided args", async () => {
      const task = { id: "t1", title: "New task" };
      mockCreateTask.mockResolvedValueOnce(task);

      const execute = getToolExecute("createTask");
      const result = await execute({ title: "New task", priority: 2 });

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "New task", priority: 2 }),
      );
      expect(result).toEqual({ task });
    });

    it("handles repository errors", async () => {
      mockCreateTask.mockRejectedValueOnce(new Error("DB error"));
      const execute = getToolExecute("createTask");

      await expect(execute({ title: "fail" })).rejects.toThrow("DB error");
    });
  });

  describe("getTodayTasks", () => {
    it("returns today's tasks", async () => {
      const tasks = [{ id: "t1", title: "Today task" }];
      mockGetTodayTasks.mockResolvedValueOnce(tasks);

      const execute = getToolExecute("getTodayTasks");
      const result = await execute({});

      expect(result).toEqual({ tasks, count: 1 });
    });

    it("returns empty count when no tasks", async () => {
      mockGetTodayTasks.mockResolvedValueOnce([]);

      const execute = getToolExecute("getTodayTasks");
      const result = await execute({});

      expect(result).toEqual({ tasks: [], count: 0 });
    });
  });

  describe("queryTasks", () => {
    it("queries tasks with filters", async () => {
      const tasks = [{ id: "t1", title: "Filtered task" }];
      mockQueryTasks.mockResolvedValueOnce(tasks);

      const execute = getToolExecute("queryTasks");
      const result = await execute({ status: "pending", priority: 1 });

      expect(mockQueryTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", priority: 1 }),
      );
      expect(result).toEqual({ tasks, count: 1 });
    });
  });

  describe("updateTask", () => {
    it("updates a task", async () => {
      const task = { id: "t1", title: "Updated" };
      mockUpdateTask.mockResolvedValueOnce(task);

      const execute = getToolExecute("updateTask");
      const result = await execute({ taskId: "t1", title: "Updated" });

      expect(mockUpdateTask).toHaveBeenCalledWith("t1", { title: "Updated" });
      expect(result).toEqual({ task });
    });
  });

  describe("deleteTask", () => {
    it("deletes a task", async () => {
      mockDeleteTask.mockResolvedValueOnce(undefined);

      const execute = getToolExecute("deleteTask");
      const result = await execute({ taskId: "t1" });

      expect(mockDeleteTask).toHaveBeenCalledWith("t1");
      expect(result).toEqual({ success: true });
    });
  });
});
