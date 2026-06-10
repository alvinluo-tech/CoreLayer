import { describe, it, expect, beforeEach, vi } from "vitest";

const mockRoute = vi.fn();
const mockHonoInstance = { route: mockRoute };

vi.mock("../http/routes/conversations.js", () => ({ default: "conversations-routes" }));
vi.mock("../http/routes/tasks.js", () => ({ default: "task-routes" }));
vi.mock("../http/routes/articles.js", () => ({ default: "article-routes" }));
vi.mock("../http/routes/reviews.js", () => ({ default: "review-routes" }));
vi.mock("../http/routes/settings.js", () => ({ default: "settings-routes" }));
vi.mock("../http/routes/chat.js", () => ({ default: "chat-routes" }));
vi.mock("../http/routes/voice.js", () => ({ default: "voice-routes" }));
vi.mock("../http/routes/mcp.js", () => ({ default: "mcp-routes" }));
vi.mock("../http/routes/tools.js", () => ({ default: "tool-routes" }));
vi.mock("../http/routes/scheduled-tasks.js", () => ({ default: "scheduled-task-routes" }));
vi.mock("../http/routes/approval.js", () => ({ default: "approval-routes" }));
vi.mock("../http/routes/workspaces.js", () => ({ default: "workspace-routes" }));
vi.mock("../http/routes/projects.js", () => ({ default: "project-routes" }));
vi.mock("../http/routes/runs.js", () => ({ default: "runs-routes" }));
vi.mock("../http/routes/queue.js", () => ({ default: "queue-routes" }));
vi.mock("../http/routes/memories.js", () => ({ default: "memory-routes" }));
vi.mock("../http/routes/agent-profiles.js", () => ({ default: "agent-profile-routes" }));
vi.mock("../http/routes/events.js", () => ({ default: "event-routes" }));
vi.mock("../http/routes/audit.js", () => ({ default: "audit-routes" }));
vi.mock("../http/routes/runtime.js", () => ({ default: "runtime-routes" }));
vi.mock("../http/routes/runtimes.js", () => ({ default: "runtimes-routes" }));
vi.mock("../http/routes/agent-broker.js", () => ({ default: "agent-broker-routes" }));

const { registerRoutes } = await import("./register-routes.js");

describe("registerRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers all route groups", () => {
    registerRoutes(mockHonoInstance as any);

    // 22 route registrations: chat, conversations, tasks, articles, reviews,
    // settings, voice, mcp, tools, tasks/scheduled, approvals, workspaces,
    // projects, runtimes, runtime/queue, memories, agent-profiles, events,
    // audit, runtime, agent-broker
    expect(mockRoute).toHaveBeenCalledTimes(22);
  });

  it("registers chat routes at /api/chat", () => {
    registerRoutes(mockHonoInstance as any);

    const chatCall = mockRoute.mock.calls.find((c) => c[0] === "/api/chat");
    expect(chatCall).toBeDefined();
    expect(chatCall![1]).toBe("chat-routes");
  });

  it("registers conversation routes at /api/conversations", () => {
    registerRoutes(mockHonoInstance as any);

    const call = mockRoute.mock.calls.find((c) => c[0] === "/api/conversations");
    expect(call).toBeDefined();
    expect(call![1]).toBe("conversations-routes");
  });

  it("registers task routes at /api/tasks", () => {
    registerRoutes(mockHonoInstance as any);

    const call = mockRoute.mock.calls.find((c) => c[0] === "/api/tasks");
    expect(call).toBeDefined();
    expect(call![1]).toBe("task-routes");
  });

  it("registers scheduled task routes at /api/tasks/scheduled", () => {
    registerRoutes(mockHonoInstance as any);

    const call = mockRoute.mock.calls.find((c) => c[0] === "/api/tasks/scheduled");
    expect(call).toBeDefined();
    expect(call![1]).toBe("scheduled-task-routes");
  });

  it("registers all 22 unique route paths", () => {
    registerRoutes(mockHonoInstance as any);

    const paths = mockRoute.mock.calls.map((c) => c[0]);
    const expectedPaths = [
      "/api/chat",
      "/api/conversations",
      "/api/tasks",
      "/api/articles",
      "/api/reviews",
      "/api/settings",
      "/api/voice",
      "/api/mcp",
      "/api/tools",
      "/api/tasks/scheduled",
      "/api/approvals",
      "/api/workspaces",
      "/api/projects",
      "/api/runs",
      "/api/runtimes",
      "/api/runtime/queue",
      "/api/memories",
      "/api/agent-profiles",
      "/api/events",
      "/api/audit",
      "/api/runtime",
      "/api/agent-broker",
    ];

    expect(paths).toHaveLength(22);
    for (const path of expectedPaths) {
      expect(paths).toContain(path);
    }
  });
});
