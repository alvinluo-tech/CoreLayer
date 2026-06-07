import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- In-memory mock repos ----
let goals: any[] = [];
let goalSeq = 0;

const mockGoalRepo = {
  create: vi.fn(async (input: any) => {
    const goal = { id: `g${++goalSeq}`, userId: "default", description: input.description, status: input.status ?? "active", progress: input.progress ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    goals.push(goal);
    return goal;
  }),
  getById: vi.fn(async (id: string) => goals.find((g) => g.id === id) ?? null),
  list: vi.fn(async () => [...goals]),
  getActive: vi.fn(async () => goals.filter((g) => g.status === "active")),
  update: vi.fn(async (id: string, data: any) => {
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error(`Goal not found: ${id}`);
    goals[idx] = { ...goals[idx], ...data, updatedAt: new Date().toISOString() };
    return goals[idx];
  }),
  delete: vi.fn(async (id: string) => {
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    goals.splice(idx, 1);
    return true;
  }),
};

vi.mock("../../../persistence/factory.js", () => ({
  getRepositories: () => ({ goals: mockGoalRepo }),
}));

import { handleGoalCommand, isGoalCommand, GoalJudge } from "../application/goal-handler.js";

describe("isGoalCommand", () => {
  it("detects /goal commands", () => {
    expect(isGoalCommand("/goal learn Rust")).toBe(true);
    expect(isGoalCommand("/goal status")).toBe(true);
    expect(isGoalCommand("hello")).toBe(false);
    expect(isGoalCommand("/todo add task")).toBe(false);
  });
});

describe("handleGoalCommand", () => {
  beforeEach(() => {
    goals = [];
    goalSeq = 0;
    vi.clearAllMocks();
  });

  it("creates a goal from /goal <description>", async () => {
    const result = await handleGoalCommand("/goal Learn Rust by June");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Learn Rust by June");
    expect(goals).toHaveLength(1);
    expect(goals[0].description).toBe("Learn Rust by June");
  });

  it("lists goals with /goal status", async () => {
    await handleGoalCommand("/goal Learn Rust");
    await handleGoalCommand("/goal Read 5 books");
    const result = await handleGoalCommand("/goal status");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Learn Rust");
    expect(result.reply).toContain("Read 5 books");
  });

  it("shows empty message when no goals", async () => {
    const result = await handleGoalCommand("/goal status");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("没有");
  });

  it("pauses a goal with /goal pause", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const result = await handleGoalCommand("/goal pause");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("暂停");
    expect(goals[0].status).toBe("paused");
  });

  it("resumes a goal with /goal resume", async () => {
    await handleGoalCommand("/goal Learn Rust");
    await handleGoalCommand("/goal pause");
    const result = await handleGoalCommand("/goal resume");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("恢复");
    expect(goals[0].status).toBe("active");
  });

  it("completes a goal with /goal complete", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const result = await handleGoalCommand("/goal complete");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("完成");
    expect(goals[0].status).toBe("completed");
  });

  it("abandons a goal with /goal abandon", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const result = await handleGoalCommand("/goal abandon");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("放弃");
    expect(goals[0].status).toBe("abandoned");
  });

  it("updates progress with /goal progress <pct>", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const result = await handleGoalCommand("/goal progress 50");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("50");
    expect(goals[0].progress).toEqual({ pct: 50 });
  });

  it("deletes a goal with /goal delete", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const result = await handleGoalCommand("/goal delete");
    expect(result.handled).toBe(true);
    expect(goals).toHaveLength(0);
  });

  it("shows help with /goal help", async () => {
    const result = await handleGoalCommand("/goal help");
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("/goal");
  });
});

describe("GoalJudge", () => {
  beforeEach(() => {
    goals = [];
    goalSeq = 0;
    vi.clearAllMocks();
  });

  it("returns no continuation when no active goals", async () => {
    const judge = new GoalJudge();
    const result = await judge.checkAfterTurn("Here is the answer.");
    expect(result.needsContinuation).toBe(false);
  });

  it("skips judge when agent already answered comprehensively", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const judge = new GoalJudge();
    const longAnswer = "Rust is a systems programming language. ".repeat(20);
    const result = await judge.checkAfterTurn(longAnswer);
    expect(result.needsContinuation).toBe(false);
  });

  it("detects short answer with active goal and suggests continuation", async () => {
    await handleGoalCommand("/goal Learn Rust");
    const judge = new GoalJudge();
    const result = await judge.checkAfterTurn("OK.");
    expect(result.needsContinuation).toBe(true);
    expect(result.continuationPrompt).toContain("Learn Rust");
  });
});
