import { describe, it, expect, beforeEach, vi } from "vitest";

// Drizzle ORM mock chain
const mockAll = vi.fn();
const mockWhere = vi.fn(() => ({ all: mockAll }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../persistence/client.js", () => ({
  db: { select: mockSelect },
  schema: {
    agentProfiles: {
      enabled: "enabled_col",
      id: "id_col",
      name: "name_col",
      role: "role_col",
      capabilities: "capabilities_col",
      skills: "skills_col",
      permissions: "permissions_col",
      isDefault: "isDefault_col",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: "eq" })),
}));

const { proposeTeam } = await import("./agent-broker.js");

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    name: "Test Agent",
    role: "coding",
    capabilities: JSON.stringify(["typescript", "react"]),
    skills: JSON.stringify(["testing"]),
    permissions: JSON.stringify(["read"]),
    isDefault: false,
    enabled: true,
    ...overrides,
  };
}

describe("proposeTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return no agents warning when no agents are enabled", () => {
    mockAll.mockReturnValue([]);

    const result = proposeTeam({ goal: "build an app" });

    expect(result.agents).toEqual([]);
    expect(result.warnings).toContain("No agents available. Create agent profiles first.");
  });

  it("should select agents matching role to goal keywords", () => {
    const planner = makeAgent({ id: "a1", role: "planner", name: "Planner" });
    const coder = makeAgent({ id: "a2", role: "coding", name: "Coder" });
    const reviewer = makeAgent({ id: "a3", role: "review", name: "Reviewer" });
    mockAll.mockReturnValue([planner, coder, reviewer]);

    const result = proposeTeam({ goal: "build and implement a feature" });

    expect(result.agents.length).toBeGreaterThan(0);
    // Coding agent should be ranked higher for "build" goal
    const coderIdx = result.agents.findIndex((a) => a.id === "a2");
    const plannerIdx = result.agents.findIndex((a) => a.id === "a1");
    expect(coderIdx).toBeLessThan(plannerIdx);
  });

  it("should boost score for matching capabilities", () => {
    const agent = makeAgent({
      capabilities: JSON.stringify(["typescript", "react", "node"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({
      goal: "build something",
      requiredCapabilities: ["typescript", "react"],
    });

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].reason).toContain("typescript");
  });

  it("should assign medium risk for shell_exec permission", () => {
    const agent = makeAgent({
      permissions: JSON.stringify(["shell_exec", "read"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "run tests" });

    expect(result.agents[0].risk).toBe("medium");
  });

  it("should assign medium risk for file_write permission", () => {
    const agent = makeAgent({
      permissions: JSON.stringify(["file_write"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "write code" });

    expect(result.agents[0].risk).toBe("medium");
  });

  it("should assign medium risk when permissions exceed 3", () => {
    const agent = makeAgent({
      permissions: JSON.stringify(["read", "write", "exec", "net"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "do things" });

    expect(result.agents[0].risk).toBe("medium");
  });

  it("should assign low risk for minimal permissions", () => {
    const agent = makeAgent({
      permissions: JSON.stringify(["read"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "read data" });

    expect(result.agents[0].risk).toBe("low");
  });

  it("should include default agent boost in reason", () => {
    const agent = makeAgent({ isDefault: true });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "plan architecture" });

    expect(result.agents[0].reason).toContain("default agent");
  });

  it("should respect maxAgents limit", () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      makeAgent({ id: `a${i}`, name: `Agent ${i}` }),
    );
    mockAll.mockReturnValue(agents);

    const result = proposeTeam({ goal: "build app", maxAgents: 3 });

    expect(result.agents.length).toBeLessThanOrEqual(3);
  });

  it("should warn when only one agent is selected", () => {
    mockAll.mockReturnValue([makeAgent()]);

    const result = proposeTeam({ goal: "build app" });

    expect(result.warnings).toContain(
      "Only one agent selected. Consider adding more for parallel execution.",
    );
  });

  it("should default maxAgents to 5", () => {
    const agents = Array.from({ length: 8 }, (_, i) =>
      makeAgent({ id: `a${i}`, name: `Agent ${i}` }),
    );
    mockAll.mockReturnValue(agents);

    const result = proposeTeam({ goal: "build app" });

    expect(result.agents.length).toBeLessThanOrEqual(5);
  });

  it("should include first 3 capabilities in reason", () => {
    const agent = makeAgent({
      capabilities: JSON.stringify(["a", "b", "c", "d"]),
    });
    mockAll.mockReturnValue([agent]);

    const result = proposeTeam({ goal: "build", requiredCapabilities: ["a"] });

    expect(result.agents[0].reason).toContain("a, b, c");
    expect(result.agents[0].reason).not.toContain("a, b, c, d");
  });

  it("should handle empty requiredCapabilities", () => {
    mockAll.mockReturnValue([makeAgent()]);

    const result = proposeTeam({ goal: "build app" });

    expect(result.agents).toHaveLength(1);
    // Single agent triggers a warning about parallel execution
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
