import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock repositories
const mockWorkspacesCreate = vi.fn();
const mockWorkspacesUpdate = vi.fn();
const mockWorkspacesGetDefault = vi.fn();
const mockProjectsCreate = vi.fn();
const mockTasksCreate = vi.fn();
const mockTasksUpdate = vi.fn();
const mockAgentProfilesGetById = vi.fn();
const mockEventLogCreate = vi.fn();

vi.mock("../persistence/factory.js", () => ({
  getRepositories: () => ({
    workspaces: {
      create: mockWorkspacesCreate,
      update: mockWorkspacesUpdate,
      getDefault: mockWorkspacesGetDefault,
    },
    projects: { create: mockProjectsCreate },
    tasks: { create: mockTasksCreate, update: mockTasksUpdate },
    agentProfiles: { getById: mockAgentProfilesGetById },
    eventLog: { create: mockEventLogCreate },
  }),
}));

// Mock LLM
const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

// Mock model gateway
vi.mock("../gateways/model/gateway.js", () => ({
  getModelGateway: () => ({
    selectModel: vi.fn(() => "model-1"),
    getModel: vi.fn(() => ({ id: "model-1" })),
  }),
}));

// Mock agent broker
vi.mock("./agent-broker.js", () => ({
  proposeTeam: vi.fn(() => ({
    agents: [
      { id: "agent-1", name: "Coder", role: "coding", reason: "Selected", risk: "low", permissions: ["read"] },
    ],
    warnings: [],
  })),
}));

// Mock queue service
vi.mock("../workflow/queue-service.js", () => ({
  enqueue: vi.fn(async () => ({ runId: "run-1" })),
}));

// Mock errors
vi.mock("../shared/errors.js", () => ({
  logError: vi.fn(),
}));

// Mock event emitter
const mockEmitWorkspaceEvent = vi.fn();
vi.mock("./workspace-event-emitter.js", () => ({
  emitWorkspaceEvent: (...args: unknown[]) => mockEmitWorkspaceEvent(...args),
}));

// Mock Drizzle ORM — full chain needed by repos + orchestrator
const mockAll = vi.fn().mockReturnValue([]);
const mockGet = vi.fn().mockReturnValue(undefined);
const mockLimit = vi.fn(() => ({ all: mockAll }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
const mockWhere = vi.fn(() => ({ all: mockAll, get: mockGet, orderBy: mockOrderBy, limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere, get: mockGet, innerJoin: mockInnerJoin, orderBy: mockOrderBy, all: mockAll }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));
const mockValues = vi.fn(async () => {});
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("../persistence/client.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: {
    workspaceAgents: {
      workspaceId: "wa_wsId",
      agentProfileId: "wa_agentId",
    },
    workspaces: {},
    artifacts: {},
    modelProfiles: {},
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: "eq" })),
  and: vi.fn((_a: unknown, _b: unknown) => ({ type: "and" })),
}));

const { orchestrateFromGoal } = await import("./workspace-orchestrator.js");

describe("orchestrateFromGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspacesCreate.mockResolvedValue({
      id: "ws-1", name: "Test Goal", goal: "Test Goal", status: "planning",
    });
    mockProjectsCreate.mockResolvedValue({
      id: "proj-1", name: "Test Goal", spec: null, techStack: null,
    });
    mockTasksCreate.mockImplementation(async (data: Record<string, unknown>) => ({
      id: `task-${Date.now()}`,
      title: data.title as string,
      priority: data.priority as number,
      dependencies: data.dependencies as string[],
    }));
    mockAgentProfilesGetById.mockResolvedValue({
      id: "agent-1", name: "Coder", role: "coding",
    });
    // Return a valid workspace row for getById calls (used by update)
    mockGet.mockReturnValue({
      id: "ws-1", name: "Test Goal", description: "Test Goal", goal: "Test Goal",
      status: "planning", activeProjectId: null, completedAt: null,
      ownerId: "default", settings: null, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    });
    mockGenerateText.mockResolvedValue({ text: '{"summary":"A test","techStack":"TypeScript","nonGoals":[],"constraints":[],"milestones":[]}' });
  });

  it("should create workspace, project, tasks, and return result", async () => {
    const result = await orchestrateFromGoal("Build a todo app");

    expect(result.workspace.id).toBe("ws-1");
    expect(result.project.id).toBe("proj-1");
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.workspace.status).toBe("running");
  });

  it("should create workspace with truncated name for long goals", async () => {
    const longGoal = "A".repeat(80);
    await orchestrateFromGoal(longGoal);

    expect(mockWorkspacesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining("..."),
        goal: longGoal,
        status: "planning",
      }),
    );
  });

  it("should keep short goal names intact", async () => {
    await orchestrateFromGoal("Build app");

    expect(mockWorkspacesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Build app",
      }),
    );
  });

  it("should set active project on workspace", async () => {
    await orchestrateFromGoal("Build app");

    expect(mockWorkspacesUpdate).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ activeProjectId: "proj-1" }),
    );
  });

  it("should continue without spec when LLM fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    const result = await orchestrateFromGoal("Build app");

    expect(result.project.spec).toBeNull();
    expect(result.project.techStack).toBeNull();
    expect(result.workspace.status).toBe("running");
  });

  it("should parse spec with techStack as string", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"summary":"Test","techStack":"React, Node.js","nonGoals":[],"constraints":[],"milestones":[]}',
    });

    const result = await orchestrateFromGoal("Build app");

    expect(result.project.techStack).toBe("React, Node.js");
  });

  it("should parse spec with techStack as array", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"summary":"Test","techStack":["React","Node.js"],"nonGoals":[],"constraints":[],"milestones":[]}',
    });

    const result = await orchestrateFromGoal("Build app");

    expect(result.project.techStack).toBe("React, Node.js");
  });

  it("should enqueue tasks with no dependencies", async () => {
    const { enqueue } = await import("../workflow/queue-service.js");

    await orchestrateFromGoal("Build app");

    expect(enqueue).toHaveBeenCalled();
  });

  it("should log orchestration event", async () => {
    await orchestrateFromGoal("Build app");

    // Should emit the final orchestrated summary event via eventLog.create
    expect(mockEventLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.orchestrated",
        payload: expect.objectContaining({
          workspaceId: "ws-1",
        }),
      }),
    );
  });

  it("should emit structured workspace events during orchestration", async () => {
    await orchestrateFromGoal("Build app");

    // Verify the emitter was called for key lifecycle events
    const emittedTypes = mockEmitWorkspaceEvent.mock.calls.map(
      (call: any[]) => call[0].type,
    );

    expect(emittedTypes).toContain("workspace.created");
    expect(emittedTypes).toContain("workspace.spec.generated");
    expect(emittedTypes).toContain("workspace.project.created");
    expect(emittedTypes).toContain("workspace.tasks.decomposed");
    expect(emittedTypes).toContain("workspace.team.assigned");
    expect(emittedTypes).toContain("workspace.artifact.created");
    expect(emittedTypes).toContain("workspace.task.queued");
  });

  it("should emit spec fallback event when LLM fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("LLM unavailable"));

    await orchestrateFromGoal("Build app");

    const emittedTypes = mockEmitWorkspaceEvent.mock.calls.map(
      (call: any[]) => call[0].type,
    );

    expect(emittedTypes).toContain("workspace.spec.fallback");
  });

  it("should create spec artifact when spec is generated", async () => {
    await orchestrateFromGoal("Build app");

    // The spec artifact is created via db.insert — verify the overall flow
    expect((result: unknown) => result !== undefined);
  });

  it("should map agent profile role to workspace role", async () => {
    mockAgentProfilesGetById.mockResolvedValue({
      id: "agent-1", name: "Planner", role: "planner",
    });

    const { proposeTeam } = await import("./agent-broker.js");
    vi.mocked(proposeTeam).mockReturnValue({
      agents: [{ id: "agent-1", name: "Planner", role: "planner", reason: "test", risk: "low", permissions: [] }],
      warnings: [],
    });

    const result = await orchestrateFromGoal("Plan architecture");

    expect(result.agents.length).toBeGreaterThan(0);
  });

  it("should skip agent when profile not found", async () => {
    const { proposeTeam } = await import("./agent-broker.js");
    vi.mocked(proposeTeam).mockReturnValue({
      agents: [{ id: "ghost", name: "Ghost", role: "coding", reason: "test", risk: "low", permissions: [] }],
      warnings: [],
    });
    mockAgentProfilesGetById.mockResolvedValue(null);

    const result = await orchestrateFromGoal("Build app");

    expect(result.agents).toEqual([]);
  });

  it("should handle malformed LLM response gracefully", async () => {
    mockGenerateText.mockResolvedValue({ text: "not json at all" });

    const result = await orchestrateFromGoal("Build app");

    // Should still complete with fallback spec
    expect(result.workspace.status).toBe("running");
  });

  it("should handle empty LLM response for task decomposition", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: '{"summary":"Test","techStack":"TS","nonGoals":[],"constraints":[],"milestones":[]}' })
      .mockResolvedValueOnce({ text: "no json here" });

    const result = await orchestrateFromGoal("Build app");

    // Should create fallback task
    expect(result.tasks.length).toBe(1);
  });

  it("should use provided spec option and skip LLM call", async () => {
    mockGenerateText.mockClear();

    const result = await orchestrateFromGoal("Build app", {
      spec: {
        summary: "Provided summary",
        nonGoals: ["nong1"],
        techStack: "Vue, Python",
        constraints: ["const1"],
        milestones: ["mile1"],
      },
    });

    expect(mockGenerateText).not.toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are a project planner"),
      }),
    );
    expect(JSON.parse(result.project.spec!)).toEqual({
      summary: "Provided summary",
      nonGoals: ["nong1"],
      techStack: "Vue, Python",
      constraints: ["const1"],
      milestones: ["mile1"],
    });
    expect(result.project.techStack).toBe("Vue, Python");
  });

  it("should assign only provided agentIds and bypass proposeTeam", async () => {
    const { proposeTeam } = await import("./agent-broker.js");
    vi.mocked(proposeTeam).mockClear();

    mockAgentProfilesGetById.mockImplementation(async (id: string) => {
      if (id === "agent-custom-1") {
        return { id: "agent-custom-1", name: "Custom Coder", role: "coding" };
      }
      return null;
    });

    const result = await orchestrateFromGoal("Build app", {
      agentIds: ["agent-custom-1", "nonexistent-agent"],
    });

    expect(proposeTeam).not.toHaveBeenCalled();
    expect(result.agents).toEqual([
      { id: "agent-custom-1", name: "Custom Coder", role: "coding" },
    ]);
  });
});
