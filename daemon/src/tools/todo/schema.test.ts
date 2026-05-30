import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  queryTasksSchema,
  updateTaskSchema,
  deleteTaskSchema,
} from "./schema.js";

describe("createTaskSchema", () => {
  it("should accept valid input with only title and apply defaults", () => {
    const result = createTaskSchema.parse({
      title: "Buy groceries",
    });
    expect(result.priority).toBe(3);
    expect(result.tags).toEqual([]);
  });

  it("should accept valid input with all fields", () => {
    const result = createTaskSchema.safeParse({
      title: "Buy groceries",
      priority: 1,
      dueDate: "2024-06-15",
      tags: ["shopping", "urgent"],
      description: "Weekly grocery run",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when title is missing", () => {
    const result = createTaskSchema.safeParse({
      priority: 3,
    });
    expect(result.success).toBe(false);
  });

  it("should fail when priority exceeds 5", () => {
    const result = createTaskSchema.safeParse({
      title: "Test task",
      priority: 6,
    });
    expect(result.success).toBe(false);
  });

  it("should fail when priority is less than 1", () => {
    const result = createTaskSchema.safeParse({
      title: "Test task",
      priority: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should fail on invalid date format 2024-1-1", () => {
    const result = createTaskSchema.safeParse({
      title: "Test task",
      dueDate: "2024-1-1",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid date format 2024-01-01", () => {
    const result = createTaskSchema.safeParse({
      title: "Test task",
      dueDate: "2024-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("should default priority to 3", () => {
    const result = createTaskSchema.parse({ title: "Test" });
    expect(result.priority).toBe(3);
  });

  it("should default tags to empty array", () => {
    const result = createTaskSchema.parse({ title: "Test" });
    expect(result.tags).toEqual([]);
  });
});

describe("queryTasksSchema", () => {
  it("should accept valid input with no filters", () => {
    const result = queryTasksSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept valid input with status enum", () => {
    const result = queryTasksSchema.safeParse({ status: "pending" });
    expect(result.success).toBe(true);
  });

  it("should fail when status is invalid", () => {
    const result = queryTasksSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("should accept valid input with taskId only", () => {
    const result = updateTaskSchema.safeParse({
      taskId: "task-1",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when taskId is missing", () => {
    const result = updateTaskSchema.safeParse({
      title: "Updated title",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid date format", () => {
    const result = updateTaskSchema.safeParse({
      taskId: "task-1",
      dueDate: "2024-12-31",
    });
    expect(result.success).toBe(true);
  });
});

describe("deleteTaskSchema", () => {
  it("should accept valid input", () => {
    const result = deleteTaskSchema.safeParse({
      taskId: "task-1",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when taskId is missing", () => {
    const result = deleteTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should fail when taskId is empty", () => {
    const result = deleteTaskSchema.safeParse({
      taskId: "",
    });
    expect(result.success).toBe(false);
  });
});
