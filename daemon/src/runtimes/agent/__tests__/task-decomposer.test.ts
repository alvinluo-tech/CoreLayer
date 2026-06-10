import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module
const mockCreateTask = vi.fn();
const mockGetModel = vi.fn();
const mockSelectModel = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  getModelGateway: () => ({
    getModel: mockGetModel,
    selectModel: mockSelectModel,
  }),
}));

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({
    tasks: {
      create: mockCreateTask,
    },
  }),
}));

vi.mock("../../../shared/errors.js", () => ({
  logError: vi.fn(),
}));

const { decomposeTask } = await import("../application/task-decomposer.js");

describe("decomposeTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectModel.mockReturnValue("test-model");
    mockGetModel.mockReturnValue("mock-model-instance");
  });

  it("creates a parent task and subtasks from AI response", async () => {
    const parentTask = { id: "parent-1", title: "Build feature" };
    const subtask1 = { id: "sub-1", title: "Design API" };
    const subtask2 = { id: "sub-2", title: "Implement backend" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(subtask1)
      .mockResolvedValueOnce(subtask2);

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          title: "Design API",
          description: "Design the API endpoints",
          objective: "Create API spec",
          priority: 1,
          dependencies: [],
          acceptanceCriteria: ["API spec documented"],
        },
        {
          title: "Implement backend",
          description: "Build the backend",
          objective: "Working API",
          priority: 2,
          dependencies: [0],
          acceptanceCriteria: ["All endpoints working"],
        },
      ]),
    });

    const result = await decomposeTask("Build feature", "project-1");

    expect(result.parentTaskId).toBe("parent-1");
    expect(result.subtasks).toEqual([
      { id: "sub-1", title: "Design API" },
      { id: "sub-2", title: "Implement backend" },
    ]);

    // Parent task created with truncated title if > 80 chars
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Build feature",
        description: "Build feature",
        objective: "Build feature",
        priority: 2,
      }),
    );

    // Subtasks created with resolved dependencies
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Design API",
        dependencies: [],
        parentTaskId: "parent-1",
      }),
    );
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Implement backend",
        dependencies: ["sub-1"],
        parentTaskId: "parent-1",
      }),
    );
  });

  it("truncates long objective to 80 chars for parent title", async () => {
    const longObjective = "A".repeat(100);
    mockCreateTask.mockResolvedValueOnce({ id: "parent-1", title: "A".repeat(77) + "..." });
    mockGenerateText.mockResolvedValueOnce({ text: "[]" });

    await decomposeTask(longObjective, "project-1");

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "A".repeat(77) + "...",
      }),
    );
  });

  it("falls back to single subtask when AI response has no JSON array", async () => {
    const parentTask = { id: "parent-1", title: "Build feature" };
    const fallbackTask = { id: "fallback-1", title: "Build feature" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(fallbackTask);

    mockGenerateText.mockResolvedValueOnce({
      text: "Sorry, I cannot decompose this task.",
    });

    const result = await decomposeTask("Build feature", "project-1");

    expect(result.parentTaskId).toBe("parent-1");
    expect(result.subtasks).toEqual([{ id: "fallback-1", title: "Build feature" }]);
  });

  it("falls back to single subtask when AI returns invalid JSON", async () => {
    const parentTask = { id: "parent-1", title: "Test" };
    const fallbackTask = { id: "fallback-1", title: "Test" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(fallbackTask);

    mockGenerateText.mockResolvedValueOnce({
      text: "Here is the decomposition: [{invalid json}]",
    });

    const result = await decomposeTask("Test", "project-1");

    expect(result.parentTaskId).toBe("parent-1");
    expect(result.subtasks).toEqual([{ id: "fallback-1", title: "Test" }]);
  });

  it("falls back when generateText throws", async () => {
    const parentTask = { id: "parent-1", title: "Test" };
    const fallbackTask = { id: "fallback-1", title: "Test" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(fallbackTask);

    mockGenerateText.mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await decomposeTask("Test", "project-1");

    expect(result.parentTaskId).toBe("parent-1");
    expect(result.subtasks).toEqual([{ id: "fallback-1", title: "Test" }]);
  });

  it("passes agentId to parent and subtask creation", async () => {
    const parentTask = { id: "parent-1", title: "Test" };
    const subtask = { id: "sub-1", title: "Sub" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(subtask);

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          title: "Sub",
          description: "Sub task",
          objective: "Sub objective",
          priority: 3,
          dependencies: [],
          acceptanceCriteria: [],
        },
      ]),
    });

    await decomposeTask("Test", "project-1", "agent-1");

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAgentId: "agent-1" }),
    );
  });

  it("filters out invalid dependency indices", async () => {
    const parentTask = { id: "parent-1", title: "Test" };
    const subtask1 = { id: "sub-1", title: "A" };
    const subtask2 = { id: "sub-2", title: "B" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(subtask1)
      .mockResolvedValueOnce(subtask2);

    // Subtask 1 depends on index 5 (doesn't exist) and index 0 (valid)
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([
        {
          title: "A",
          description: "First",
          objective: "Obj A",
          priority: 1,
          dependencies: [],
          acceptanceCriteria: [],
        },
        {
          title: "B",
          description: "Second",
          objective: "Obj B",
          priority: 2,
          dependencies: [5, 0],
          acceptanceCriteria: [],
        },
      ]),
    });

    await decomposeTask("Test", "project-1");

    // Second subtask should only have valid dependency (index 0 -> sub-1)
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "B",
        dependencies: ["sub-1"],
      }),
    );
  });

  it("extracts JSON from markdown code blocks", async () => {
    const parentTask = { id: "parent-1", title: "Test" };
    const subtask = { id: "sub-1", title: "Step 1" };

    mockCreateTask
      .mockResolvedValueOnce(parentTask)
      .mockResolvedValueOnce(subtask);

    mockGenerateText.mockResolvedValueOnce({
      text: "```json\n[{\"title\":\"Step 1\",\"description\":\"Do it\",\"objective\":\"Complete\",\"priority\":1,\"dependencies\":[],\"acceptanceCriteria\":[]}]\n```",
    });

    const result = await decomposeTask("Test", "project-1");

    expect(result.subtasks).toEqual([{ id: "sub-1", title: "Step 1" }]);
  });
});
