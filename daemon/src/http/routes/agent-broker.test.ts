import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockProposeTeam } = vi.hoisted(() => ({
  mockProposeTeam: vi.fn(),
}));

vi.mock("../../services/agent-broker.js", () => ({
  proposeTeam: (...args: unknown[]) => mockProposeTeam(...args),
}));

vi.mock("../../shared/errors.js", () => ({
  apiError: vi.fn((_c: unknown, message: string, status = 500) =>
    new Response(JSON.stringify({ error: message }), { status }),
  ),
  extractErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  logError: vi.fn(),
}));

import app from "./agent-broker.js";

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
  });

  it("POST /propose-team returns proposal for valid goal", async () => {
    mockProposeTeam.mockReturnValue({
      agents: [{ id: "a1", role: "builder" }],
      rationale: "test",
    });

    const res = await app.fetch(
      makeRequest("/propose-team", "POST", { goal: "build a web app" }),
    );
    const json = (await res.json()) as { data: { agents: unknown[] } };

    expect(res.status).toBe(200);
    expect(json.data.agents).toHaveLength(1);
    expect(mockProposeTeam).toHaveBeenCalledWith({
      goal: "build a web app",
      requiredCapabilities: undefined,
      maxAgents: undefined,
    });
  });

  it("passes optional fields to proposeTeam", async () => {
    mockProposeTeam.mockReturnValue({ agents: [], rationale: "" });

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
