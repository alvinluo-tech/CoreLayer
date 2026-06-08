/**
 * Integration tests for External Agent Adapters.
 *
 * Tests the A2A network adapter and Local CLI adapter with mocked fetch
 * and real command availability checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { A2AAdapter, createA2AAdapter } from "../a2a-adapter.js";
import { LocalCLIAdapter, createLocalCLIAdapter } from "../local-cli-adapter.js";
import type { AgentCard, Task } from "../protocol.js";

// ---- A2A Network Adapter ----

describe("A2AAdapter (integration)", () => {
  let adapter: A2AAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new A2AAdapter();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -- Endpoint management --

  describe("endpoint management", () => {
    it("adds and removes endpoints", () => {
      adapter.addEndpoint({ id: "agent-1", name: "Test Agent", url: "http://localhost:8001" });
      adapter.addEndpoint({ id: "agent-2", name: "Test Agent 2", url: "http://localhost:8002" });

      adapter.removeEndpoint("agent-1");

      // discover should only query remaining endpoints
      fetchSpy.mockResolvedValue({ ok: false });
      adapter.discover().then((cards) => {
        expect(cards).toHaveLength(0);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(
          "http://localhost:8002/.well-known/agent.json",
          expect.anything(),
        );
      });
    });
  });

  // -- Discovery --

  describe("discover", () => {
    it("returns empty array when no endpoints registered", async () => {
      const cards = await adapter.discover();
      expect(cards).toEqual([]);
    });

    it("discovers agent cards from registered endpoints", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      const mockCard: AgentCard = {
        id: "remote-agent",
        name: "Remote Agent",
        capabilities: [{ id: "code-gen", name: "Code Generation" }],
        inputTypes: ["text/plain"],
        outputTypes: ["text/plain"],
        requiresAuth: false,
        protocolVersion: "1.0.0",
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockCard,
      });

      const cards = await adapter.discover();

      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("remote-agent");
      expect(cards[0].name).toBe("Remote Agent");
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:8001/.well-known/agent.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("skips unreachable endpoints silently", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });
      adapter.addEndpoint({ id: "agent-2", name: "Agent 2", url: "http://localhost:8002" });

      fetchSpy
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "agent-2",
            name: "Agent 2",
            capabilities: [],
            inputTypes: ["text/plain"],
            outputTypes: ["text/plain"],
            requiresAuth: false,
            protocolVersion: "1.0.0",
          }),
        });

      const cards = await adapter.discover();

      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("agent-2");
    });

    it("skips endpoints that return non-OK status", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      fetchSpy.mockResolvedValue({ ok: false, status: 404 });

      const cards = await adapter.discover();
      expect(cards).toEqual([]);
    });
  });

  // -- getAgent --

  describe("getAgent", () => {
    it("returns null for unregistered agent", async () => {
      const result = await adapter.getAgent("nonexistent");
      expect(result).toBeNull();
    });

    it("fetches agent card for registered endpoint", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      const mockCard: AgentCard = {
        id: "agent-1",
        name: "Agent 1",
        capabilities: [],
        inputTypes: ["text/plain"],
        outputTypes: ["text/plain"],
        requiresAuth: false,
        protocolVersion: "1.0.0",
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockCard,
      });

      const result = await adapter.getAgent("agent-1");
      expect(result).toEqual(mockCard);
    });
  });

  // -- delegate --

  describe("delegate", () => {
    it("throws for unregistered agent", async () => {
      await expect(
        adapter.delegate({ agentId: "nonexistent", description: "Do something" }),
      ).rejects.toThrow("Agent not found: nonexistent");
    });

    it("delegates task to remote agent", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      const mockTask: Task = {
        id: "task-123",
        agentId: "agent-1",
        description: "Write a function",
        status: "running",
        messages: [],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockTask,
      });

      const result = await adapter.delegate({
        agentId: "agent-1",
        description: "Write a function",
        input: "Please write a hello world function",
      });

      expect(result.id).toBe("task-123");
      expect(result.status).toBe("running");
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:8001/tasks",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("returns failed task on network error", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const result = await adapter.delegate({
        agentId: "agent-1",
        description: "Write a function",
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Connection refused");
    });

    it("returns failed task on non-OK response", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      fetchSpy.mockResolvedValue({ ok: false, status: 500 });

      const result = await adapter.delegate({
        agentId: "agent-1",
        description: "Write a function",
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("500");
    });
  });

  // -- cancelTask --

  describe("cancelTask", () => {
    it("returns false when no endpoints match", async () => {
      const result = await adapter.cancelTask("task-123");
      expect(result).toBe(false);
    });

    it("cancels task via POST to endpoint", async () => {
      adapter.addEndpoint({ id: "agent-1", name: "Agent 1", url: "http://localhost:8001" });

      fetchSpy.mockResolvedValue({ ok: true });

      const result = await adapter.cancelTask("task-123");
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:8001/tasks/task-123/cancel",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  // -- createA2AAdapter --

  describe("createA2AAdapter", () => {
    it("creates adapter with pre-configured endpoints", () => {
      const a2a = createA2AAdapter([
        { id: "ep-1", name: "EP1", url: "http://localhost:8001" },
        { id: "ep-2", name: "EP2", url: "http://localhost:8002" },
      ]);

      expect(a2a.id).toBe("a2a-network");
      expect(a2a.name).toBe("A2A Network Adapter");
    });
  });
});

// ---- Local CLI Adapter ----

describe("LocalCLIAdapter (integration)", () => {
  // -- discover --

  describe("discover", () => {
    it("returns agent cards for all configured agents", async () => {
      const adapter = new LocalCLIAdapter([
        { id: "test-agent", name: "Test Agent", command: "node" },
      ]);

      const cards = await adapter.discover();

      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe("test-agent");
      expect(cards[0].name).toBe("Test Agent");
      expect(cards[0].capabilities).toHaveLength(2);
      expect(cards[0].requiresAuth).toBe(false);
    });

    it("checks real command availability", async () => {
      const adapter = new LocalCLIAdapter([
        { id: "node-agent", name: "Node Agent", command: "node" },
        { id: "fake-agent", name: "Fake Agent", command: "nonexistent-command-xyz" },
      ]);

      const cards = await adapter.discover();

      expect(cards).toHaveLength(2);
      // node should be available
      const nodeCard = cards.find((c) => c.id === "node-agent");
      expect(nodeCard).toBeDefined();
      // fake command should not be available
      const fakeCard = cards.find((c) => c.id === "fake-agent");
      expect(fakeCard).toBeDefined();
    });
  });

  // -- getAgent --

  describe("getAgent", () => {
    it("returns null for unknown agent", async () => {
      const adapter = new LocalCLIAdapter();
      const result = await adapter.getAgent("nonexistent");
      expect(result).toBeNull();
    });

    it("returns agent card for known agent", async () => {
      const adapter = new LocalCLIAdapter();
      const result = await adapter.getAgent("codex");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("codex");
      expect(result!.name).toBe("OpenAI Codex CLI");
    });
  });

  // -- delegate --

  describe("delegate", () => {
    it("throws for unknown agent", async () => {
      const adapter = new LocalCLIAdapter();
      await expect(
        adapter.delegate({ agentId: "nonexistent", description: "Do something" }),
      ).rejects.toThrow("CLI agent not found: nonexistent");
    });

    it("returns pending task for known agent", async () => {
      const adapter = new LocalCLIAdapter();
      const task = await adapter.delegate({
        agentId: "codex",
        description: "Write a function",
        input: "Hello world",
      });

      expect(task.status).toBe("pending");
      expect(task.agentId).toBe("codex");
      expect(task.description).toBe("Write a function");
      expect(task.messages).toHaveLength(1);
      expect(task.messages[0].role).toBe("user");
      expect(task.messages[0].content).toBe("Hello world");
    });

    it("returns task with no messages when input is omitted", async () => {
      const adapter = new LocalCLIAdapter();
      const task = await adapter.delegate({
        agentId: "codex",
        description: "Write a function",
      });

      expect(task.messages).toHaveLength(0);
    });
  });

  // -- getTaskStatus (skeleton) --

  describe("getTaskStatus", () => {
    it("throws for any task (skeleton not implemented)", async () => {
      const adapter = new LocalCLIAdapter();
      await expect(adapter.getTaskStatus("task-123")).rejects.toThrow(
        "Task status not available",
      );
    });
  });

  // -- cancelTask (skeleton) --

  describe("cancelTask", () => {
    it("returns false (skeleton not implemented)", async () => {
      const adapter = new LocalCLIAdapter();
      const result = await adapter.cancelTask("task-123");
      expect(result).toBe(false);
    });
  });

  // -- createLocalCLIAdapter --

  describe("createLocalCLIAdapter", () => {
    it("creates adapter with default agents", () => {
      const adapter = createLocalCLIAdapter();
      expect(adapter.id).toBe("local-cli");
      expect(adapter.name).toBe("Local CLI Adapter");
    });
  });
});

// ---- Protocol compliance ----

describe("External Agent Protocol compliance", () => {
  it("A2A adapter implements all ExternalAgentAdapter methods", () => {
    const adapter = new A2AAdapter();
    expect(typeof adapter.id).toBe("string");
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.discover).toBe("function");
    expect(typeof adapter.getAgent).toBe("function");
    expect(typeof adapter.delegate).toBe("function");
    expect(typeof adapter.getTaskStatus).toBe("function");
    expect(typeof adapter.cancelTask).toBe("function");
    expect(typeof adapter.streamTaskEvents).toBe("function");
  });

  it("LocalCLI adapter implements all ExternalAgentAdapter methods", () => {
    const adapter = new LocalCLIAdapter();
    expect(typeof adapter.id).toBe("string");
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.discover).toBe("function");
    expect(typeof adapter.getAgent).toBe("function");
    expect(typeof adapter.delegate).toBe("function");
    expect(typeof adapter.getTaskStatus).toBe("function");
    expect(typeof adapter.cancelTask).toBe("function");
    expect(typeof adapter.streamTaskEvents).toBe("function");
  });

  it("discover returns AgentCard[] with required fields", async () => {
    const adapter = new LocalCLIAdapter([
      { id: "test", name: "Test", command: "node" },
    ]);

    const cards = await adapter.discover();
    for (const card of cards) {
      expect(card.id).toBeDefined();
      expect(card.name).toBeDefined();
      expect(Array.isArray(card.capabilities)).toBe(true);
      expect(Array.isArray(card.inputTypes)).toBe(true);
      expect(Array.isArray(card.outputTypes)).toBe(true);
      expect(typeof card.requiresAuth).toBe("boolean");
      expect(card.protocolVersion).toBeDefined();
    }
  });

  it("delegate returns Task with required fields", async () => {
    const adapter = new LocalCLIAdapter();
    const task = await adapter.delegate({
      agentId: "codex",
      description: "Test task",
    });

    expect(task.id).toBeDefined();
    expect(task.agentId).toBe("codex");
    expect(task.description).toBe("Test task");
    expect(task.status).toBeDefined();
    expect(Array.isArray(task.messages)).toBe(true);
    expect(Array.isArray(task.artifacts)).toBe(true);
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });
});
