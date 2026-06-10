import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock repositories
const mockWorkspacesGetDefault = vi.fn();
const mockWorkspacesCreate = vi.fn();
const mockAgentProfilesGetDefault = vi.fn();
const mockAgentProfilesCreate = vi.fn();
const mockConversationsGetById = vi.fn();

vi.mock("../../persistence/factory.js", () => ({
  getRepositories: () => ({
    workspaces: {
      getDefault: mockWorkspacesGetDefault,
      create: mockWorkspacesCreate,
    },
    agentProfiles: {
      getDefault: mockAgentProfilesGetDefault,
      create: mockAgentProfilesCreate,
    },
    conversations: {
      getById: mockConversationsGetById,
    },
  }),
}));

const { resolveRunContext, resolveConversationScope } = await import("./run-context.js");

describe("resolveRunContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspacesGetDefault.mockResolvedValue({ id: "ws-default", name: "Personal" });
    mockAgentProfilesGetDefault.mockResolvedValue({ id: "agent-default", name: "Jarvis" });
  });

  it("should return provided workspaceId and agentId directly", async () => {
    const result = await resolveRunContext({
      workspaceId: "ws-1",
      agentId: "agent-1",
    });

    expect(result.workspaceId).toBe("ws-1");
    expect(result.agentId).toBe("agent-1");
    expect(mockWorkspacesCreate).not.toHaveBeenCalled();
    expect(mockAgentProfilesCreate).not.toHaveBeenCalled();
  });

  it("should create default workspace when workspaceId not provided", async () => {
    const result = await resolveRunContext({});

    expect(result.workspaceId).toBe("ws-default");
    expect(mockWorkspacesGetDefault).toHaveBeenCalledWith("default");
  });

  it("should create new workspace when default not found", async () => {
    mockWorkspacesGetDefault.mockResolvedValue(null);
    mockWorkspacesCreate.mockResolvedValue({ id: "ws-new", name: "Personal" });

    const result = await resolveRunContext({});

    expect(result.workspaceId).toBe("ws-new");
    expect(mockWorkspacesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "default", name: "Personal" }),
    );
  });

  it("should create default agent when agentId not provided", async () => {
    const result = await resolveRunContext({});

    expect(result.agentId).toBe("agent-default");
    expect(mockAgentProfilesGetDefault).toHaveBeenCalled();
  });

  it("should create new agent when default not found", async () => {
    mockAgentProfilesGetDefault.mockResolvedValue(null);
    mockAgentProfilesCreate.mockResolvedValue({ id: "agent-new", name: "Jarvis" });

    const result = await resolveRunContext({});

    expect(result.agentId).toBe("agent-new");
    expect(mockAgentProfilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Jarvis", isDefault: true }),
    );
  });

  it("should pass through projectId", async () => {
    const result = await resolveRunContext({
      workspaceId: "ws-1",
      agentId: "agent-1",
      projectId: "proj-1",
    });

    expect(result.projectId).toBe("proj-1");
  });

  it("should return undefined projectId when not provided", async () => {
    const result = await resolveRunContext({
      workspaceId: "ws-1",
      agentId: "agent-1",
    });

    expect(result.projectId).toBeUndefined();
  });
});

describe("resolveConversationScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspacesGetDefault.mockResolvedValue({ id: "ws-default", name: "Personal" });
    mockAgentProfilesGetDefault.mockResolvedValue({ id: "agent-default", name: "Jarvis" });
    mockConversationsGetById.mockResolvedValue(null);
  });

  it("should return provided IDs when no conversation exists", async () => {
    const result = await resolveConversationScope({
      conversationId: "conv-1",
      workspaceId: "ws-1",
      agentId: "agent-1",
    });

    expect(result.conversationId).toBe("conv-1");
    expect(result.workspaceId).toBe("ws-1");
    expect(result.agentId).toBe("agent-1");
  });

  it("should use conversation workspaceId when available", async () => {
    mockConversationsGetById.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-conv",
      projectId: "proj-conv",
    });

    const result = await resolveConversationScope({
      conversationId: "conv-1",
      workspaceId: "ws-req",
      agentId: "agent-1",
    });

    expect(result.workspaceId).toBe("ws-conv");
  });

  it("should use conversation projectId when available", async () => {
    mockConversationsGetById.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-conv",
      projectId: "proj-conv",
    });

    const result = await resolveConversationScope({
      conversationId: "conv-1",
      agentId: "agent-1",
    });

    expect(result.projectId).toBe("proj-conv");
  });

  it("should fall back to request projectId when conversation has none", async () => {
    mockConversationsGetById.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-conv",
      projectId: null,
    });

    const result = await resolveConversationScope({
      conversationId: "conv-1",
      projectId: "proj-req",
      agentId: "agent-1",
    });

    expect(result.projectId).toBe("proj-req");
  });

  it("should create default workspace when neither conversation nor request provides one", async () => {
    const result = await resolveConversationScope({
      agentId: "agent-1",
    });

    expect(result.workspaceId).toBe("ws-default");
  });

  it("should create default agent when not provided", async () => {
    const result = await resolveConversationScope({});

    expect(result.agentId).toBe("agent-default");
  });

  it("should pass through taskId", async () => {
    const result = await resolveConversationScope({
      workspaceId: "ws-1",
      agentId: "agent-1",
      taskId: "task-1",
    });

    expect(result.taskId).toBe("task-1");
  });

  it("should return undefined taskId when not provided", async () => {
    const result = await resolveConversationScope({
      workspaceId: "ws-1",
      agentId: "agent-1",
    });

    expect(result.taskId).toBeUndefined();
  });

  it("should handle missing conversation gracefully", async () => {
    mockConversationsGetById.mockResolvedValue(null);

    const result = await resolveConversationScope({
      conversationId: "nonexistent",
      workspaceId: "ws-1",
      agentId: "agent-1",
    });

    expect(result.workspaceId).toBe("ws-1");
    expect(result.agentId).toBe("agent-1");
  });
});
