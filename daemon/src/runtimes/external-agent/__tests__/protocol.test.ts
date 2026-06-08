/**
 * Unit tests for A2A protocol types and adapter contract.
 *
 * Validates that the protocol types are correctly structured
 * and that skeleton adapters conform to the ExternalAgentAdapter interface.
 */

import { describe, it, expect } from "vitest";
import type {
  AgentCard,
  AgentCapability,
  Task,
  TaskMessage,
  TaskArtifact,
  TaskStatus,
  ExternalAgentAdapter,
} from "../protocol.js";

describe("A2A Protocol Types", () => {
  it("AgentCard has required fields", () => {
    const card: AgentCard = {
      id: "test-agent",
      name: "Test Agent",
      capabilities: [],
      inputTypes: ["text/plain"],
      outputTypes: ["text/plain"],
      requiresAuth: false,
      protocolVersion: "1.0.0",
    };
    expect(card.id).toBe("test-agent");
    expect(card.name).toBe("Test Agent");
    expect(card.capabilities).toEqual([]);
    expect(card.requiresAuth).toBe(false);
  });

  it("AgentCapability has required fields", () => {
    const cap: AgentCapability = {
      id: "code-gen",
      name: "Code Generation",
      description: "Generates code from prompts",
    };
    expect(cap.id).toBe("code-gen");
    expect(cap.name).toBe("Code Generation");
  });

  it("Task has all required fields", () => {
    const task: Task = {
      id: "task-1",
      agentId: "agent-1",
      description: "Write a function",
      status: "pending",
      messages: [],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(task.id).toBe("task-1");
    expect(task.status).toBe("pending");
    expect(task.messages).toEqual([]);
    expect(task.artifacts).toEqual([]);
  });

  it("TaskStatus accepts all valid values", () => {
    const statuses: TaskStatus[] = [
      "pending",
      "running",
      "completed",
      "failed",
      "cancelled",
      "waiting_for_approval",
    ];
    expect(statuses).toHaveLength(6);
  });

  it("TaskMessage has required fields", () => {
    const msg: TaskMessage = {
      id: "msg-1",
      role: "user",
      content: "Hello",
      timestamp: new Date().toISOString(),
    };
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
  });

  it("TaskArtifact has required fields", () => {
    const artifact: TaskArtifact = {
      id: "art-1",
      name: "output.txt",
      mimeType: "text/plain",
      data: "Hello world",
    };
    expect(artifact.mimeType).toBe("text/plain");
    expect(artifact.data).toBe("Hello world");
  });
});

describe("ExternalAgentAdapter Contract", () => {
  it("defines expected method signatures", () => {
    // Type-level check: ensure the interface has the expected methods
    type AdapterMethods = keyof ExternalAgentAdapter;
    const methods: AdapterMethods[] = [
      "id",
      "name",
      "discover",
      "getAgent",
      "delegate",
      "getTaskStatus",
      "cancelTask",
      "streamTaskEvents",
    ];
    expect(methods).toHaveLength(8);
  });

  it("adapter delegate input has correct shape", () => {
    // Verify the delegate method's input type
    const input = {
      agentId: "agent-1",
      description: "Do something",
      input: "optional input",
      context: { key: "value" },
    };
    expect(input.agentId).toBe("agent-1");
    expect(typeof input.description).toBe("string");
  });
});
