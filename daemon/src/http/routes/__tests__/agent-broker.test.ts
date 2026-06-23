import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockProposeTeam, mockGenerateText } = vi.hoisted(() => ({
  mockProposeTeam: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock("../../../services/agent-broker.js", () => ({
  proposeTeam: (...args: unknown[]) => mockProposeTeam(...args),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("../../../gateways/model/gateway.js", () => ({
  getModelGateway: () => ({
    selectModel: vi.fn(() => "model-1"),
    getModel: vi.fn(() => ({ id: "model-1" })),
  }),
}));

vi.mock("../../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "../agent-broker.js";

function makeRequest(path: string, method = "POST", body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("agent-broker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        summary: "test spec summary",
        nonGoals: ["nongoal1"],
        techStack: "TypeScript",
        constraints: ["constraint1"],
        milestones: ["milestone1"],
      }),
    });
  });

  it("POST /propose-team returns proposal for valid goal", async () => {
    mockProposeTeam.mockReturnValue({
      agents: [{ id: "a1", role: "builder" }],
      warnings: ["warning1"],
    });

    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "build a web app" }),
    );
    const json = (await res.json()) as { data: { agents: unknown[]; warnings: string[]; spec: unknown } };

    expect(res.status).toBe(200);
    expect(json.data.agents).toHaveLength(1);
    expect(json.data.warnings).toEqual(["warning1"]);
    expect(mockProposeTeam).toHaveBeenCalledWith({
      goal: "build a web app",
      requiredCapabilities: undefined,
      maxAgents: undefined,
    });
  });

  it("passes optional fields to proposeTeam", async () => {
    mockProposeTeam.mockReturnValue({ agents: [], warnings: [] });

    await app.fetch(
      makeRequest("/propose-team", "POST", {
        goal: "do something",
        requiredCapabilities: ["coding"],
        maxAgents: 3,
      }),
    );

    expect(mockProposeTeam).toHaveBeenCalledWith({
      goal: "do something",
      requiredCapabilities: ["coding"],
      maxAgents: 3,
    });
  });

  it("POST /propose-team returns generated spec from LLM", async () => {
    mockProposeTeam.mockReturnValue({
      agents: [{ id: "a1", role: "builder" }],
      warnings: [],
    });
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        summary: "a test app",
        nonGoals: ["nothing"],
        techStack: "TypeScript",
        constraints: ["none"],
        milestones: ["m1"],
      }),
    });

    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "build a web app" }),
    );
    const json = (await res.json()) as {
      data: {
        agents: unknown[];
        warnings: string[];
        spec: Record<string, unknown>;
      };
    };

    expect(res.status).toBe(200);
    expect(json.data.spec).toEqual({
      summary: "a test app",
      nonGoals: ["nothing"],
      techStack: "TypeScript",
      constraints: ["none"],
      milestones: ["m1"],
    });
  });

  it("POST /propose-team returns fallback spec when LLM fails", async () => {
    mockProposeTeam.mockReturnValue({
      agents: [{ id: "a1", role: "builder" }],
      warnings: [],
    });
    mockGenerateText.mockRejectedValue(new Error("LLM failure"));

    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "build a web app" }),
    );
    const json = (await res.json()) as {
      data: {
        agents: unknown[];
        warnings: string[];
        spec: Record<string, unknown>;
      };
    };

    expect(res.status).toBe(200);
    expect(json.data.spec.summary).toBe("build a web app");
    expect(json.data.spec.techStack).toBe("TypeScript");
  });

  it("returns 400 when goal is missing", async () => {
    const res = await app.fetch(
      makeRequest("/propose-team", "POST", {}),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when goal is empty string", async () => {
    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 on proposeTeam error", async () => {
    mockProposeTeam.mockImplementation(() => {
      throw new Error("broker failure");
    });

    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "build" }),
    );
    expect(res.status).toBe(500);
  });
});
