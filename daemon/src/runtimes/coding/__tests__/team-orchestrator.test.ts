import { describe, it, expect } from "vitest";
import { assignTasks, needsReview, getNextPhase } from "../team-orchestrator.js";
import type { AgentSpec, TeamSpec } from "../agent-spec.js";

const teamSpec: TeamSpec = {
  id: "team-1",
  name: "Full Stack Team",
  agents: [
    { agentId: "planner-1", role: "planner", taskTypes: ["planning"] },
    { agentId: "builder-1", role: "builder", taskTypes: ["coding", "scaffold"] },
    { agentId: "reviewer-1", role: "reviewer", taskTypes: ["review"] },
  ],
  workflow: { requireReview: true, requireTests: true, maxRetries: 3 },
};

const agents: AgentSpec[] = [
  { id: "planner-1", version: "1.0.0", role: "planner", description: "", skills: ["planning"], tools: [], executorPreference: [], modelPolicy: { preferredModels: [] }, permissionMode: "normal", qualityGates: [], limits: [] },
  { id: "builder-1", version: "1.0.0", role: "builder", description: "", skills: ["coding"], tools: [], executorPreference: ["claude-code"], modelPolicy: { preferredModels: [] }, permissionMode: "normal", qualityGates: ["lint", "test"], limits: [] },
  { id: "reviewer-1", version: "1.0.0", role: "reviewer", description: "", skills: ["review"], tools: [], executorPreference: [], modelPolicy: { preferredModels: [] }, permissionMode: "normal", qualityGates: [], limits: [] },
];

describe("assignTasks", () => {
  it("should assign tasks to matching agents", () => {
    const tasks = [
      { id: "t1", type: "planning" },
      { id: "t2", type: "coding" },
      { id: "t3", type: "review" },
    ];

    const assignments = assignTasks(teamSpec, tasks, agents);
    expect(assignments).toHaveLength(3);
    expect(assignments[0].agentId).toBe("planner-1");
    expect(assignments[1].agentId).toBe("builder-1");
    expect(assignments[2].agentId).toBe("reviewer-1");
  });

  it("should skip tasks without matching team agent", () => {
    const tasks = [{ id: "t1", type: "unknown" }];
    const assignments = assignTasks(teamSpec, tasks, agents);
    expect(assignments).toHaveLength(0);
  });
});

describe("needsReview", () => {
  it("should require review for builder tasks", () => {
    expect(needsReview(teamSpec, "coding")).toBe(true);
  });

  it("should not require review for planner tasks", () => {
    expect(needsReview(teamSpec, "planning")).toBe(false);
  });

  it("should not require review when disabled", () => {
    const noReviewSpec = { ...teamSpec, workflow: { ...teamSpec.workflow, requireReview: false } };
    expect(needsReview(noReviewSpec, "coding")).toBe(false);
  });
});

describe("getNextPhase", () => {
  it("should progress through phases", () => {
    expect(getNextPhase("planning")).toBe("building");
    expect(getNextPhase("building")).toBe("reviewing");
    expect(getNextPhase("reviewing")).toBe("testing");
    expect(getNextPhase("testing")).toBe("delivering");
    expect(getNextPhase("delivering")).toBe("delivering");
  });
});
