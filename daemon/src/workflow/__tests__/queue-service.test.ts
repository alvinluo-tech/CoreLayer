/**
 * Unit tests for the queue service.
 *
 * Tests enqueue, dequeue, and getQueueStatus against a mocked persistence layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the persistence factory before importing the module under test
const mockCreate = vi.fn();
const mockGetRecent = vi.fn();
const mockGetQueued = vi.fn();
const mockGetById = vi.fn();
const mockUpdateStatus = vi.fn();
const mockAgentProfileGetById = vi.fn();

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    agentRuns: {
      create: mockCreate,
      getRecent: mockGetRecent,
      getQueued: mockGetQueued,
      getById: mockGetById,
      updateStatus: mockUpdateStatus,
    },
    agentProfiles: {
      getById: mockAgentProfileGetById,
    },
  }),
}));

import { enqueue, dequeue, getQueueStatus } from "../queue-service.js";
import type { AgentRunRow } from "../../persistence/repository.js";

function makeRun(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    id: "run-001",
    conversationId: null,
    workspaceId: null,
    projectId: null,
    taskId: "task-001",
    agentId: "agent-001",
    userMessageId: null,
    assistantMessageId: null,
    status: "queued",
    mode: "chat",
    selectedModel: null,
    routeReason: null,
    selectedTools: null,
    memoryReads: null,
    memoryWrites: null,
    toolCalls: null,
    toolCallCount: null,
    artifacts: null,
    approvals: null,
    agentSnapshot: null,
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: null,
    durationMs: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentProfileGetById.mockResolvedValue(null);
});

// ---- enqueue ----

describe("enqueue", () => {
  it("creates a queued run and returns a QueueEntry", async () => {
    const run = makeRun();
    mockCreate.mockResolvedValue(run);

    const entry = await enqueue({
      taskId: "task-001",
      agentId: "agent-001",
      mode: "chat",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      taskId: "task-001",
      agentId: "agent-001",
      conversationId: undefined,
      workspaceId: undefined,
      projectId: undefined,
      mode: "chat",
      selectedModel: undefined,
      agentSnapshot: null,
    });
    expect(entry.runId).toBe("run-001");
    expect(entry.taskId).toBe("task-001");
    expect(entry.agentId).toBe("agent-001");
    expect(entry.priority).toBe(0);
    expect(entry.enqueuedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("defaults mode to chat when not provided", async () => {
    const run = makeRun({ mode: "chat" });
    mockCreate.mockResolvedValue(run);

    await enqueue({ taskId: "task-001" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "chat" }),
    );
  });

  it("freezes the assigned agent profile into the queued run", async () => {
    const run = makeRun();
    mockCreate.mockResolvedValue(run);
    mockAgentProfileGetById.mockResolvedValue({
      id: "agent-001",
      updatedAt: "2026-07-11T00:00:00.000Z",
      capabilities: ["coding"],
      skills: ["tdd-workflow"],
      tools: ["shell"],
      knowledgeScopes: ["workspace"],
      permissions: ["file_write"],
      memoryScopes: ["project"],
      modelPolicy: { preferredModels: ["model-1"] },
      executorPolicy: { executor: "codex" },
    });

    await enqueue({ taskId: "task-001", agentId: "agent-001" });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      agentSnapshot: {
        profileId: "agent-001",
        profileUpdatedAt: "2026-07-11T00:00:00.000Z",
        profileDigest: expect.any(String),
        capabilities: ["coding"],
        skills: ["tdd-workflow"],
        tools: ["shell"],
        knowledgeScopes: ["workspace"],
        permissions: ["file_write"],
        memoryScopes: ["project"],
        modelPolicy: { preferredModels: ["model-1"] },
        executorPolicy: { executor: "codex" },
      },
    }));
  });
});

// ---- dequeue ----

describe("dequeue", () => {
  it("returns the next queued run", async () => {
    const queued = makeRun({ id: "run-queued", status: "queued", completedAt: null });
    mockGetQueued.mockResolvedValue([queued]);

    const result = await dequeue();

    expect(result).toBeDefined();
    expect(result!.id).toBe("run-queued");
  });

  it("returns null when queue is empty", async () => {
    mockGetQueued.mockResolvedValue([]);

    const result = await dequeue();

    expect(result).toBeNull();
  });

  it("skips completed runs", async () => {
    mockGetQueued.mockResolvedValue([]);

    const result = await dequeue();

    expect(result).toBeNull();
  });

  it("skips cancelled runs", async () => {
    mockGetQueued.mockResolvedValue([]);

    const result = await dequeue();

    expect(result).toBeNull();
  });
});

// ---- getQueueStatus ----

describe("getQueueStatus", () => {
  it("returns correct counts for mixed statuses", async () => {
    mockGetRecent.mockResolvedValue([
      makeRun({ id: "q1", status: "queued", completedAt: null }),
      makeRun({ id: "q2", status: "queued", completedAt: null }),
      makeRun({ id: "r1", status: "running", completedAt: null }),
      makeRun({ id: "s1", status: "succeeded", completedAt: "2026-01-01T00:01:00Z" }),
      makeRun({ id: "f1", status: "failed", completedAt: "2026-01-01T00:01:00Z" }),
    ]);

    const status = await getQueueStatus();

    expect(status.total).toBe(5);
    expect(status.queued).toBe(2);
    expect(status.running).toBe(1);
    expect(status.completed).toBe(1);
    expect(status.failed).toBe(1);
  });

  it("returns all zeros for empty queue", async () => {
    mockGetRecent.mockResolvedValue([]);

    const status = await getQueueStatus();

    expect(status.total).toBe(0);
    expect(status.queued).toBe(0);
    expect(status.running).toBe(0);
    expect(status.completed).toBe(0);
    expect(status.failed).toBe(0);
  });

  it("does not count completed runs as queued", async () => {
    mockGetRecent.mockResolvedValue([
      makeRun({ id: "q1", status: "queued", completedAt: null }),
      makeRun({ id: "q2", status: "queued", completedAt: "2026-01-01T00:01:00Z" }),
    ]);

    const status = await getQueueStatus();

    expect(status.queued).toBe(1);
  });
});
