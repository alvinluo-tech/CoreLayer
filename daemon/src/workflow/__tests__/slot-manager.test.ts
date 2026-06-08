/**
 * Unit tests for the SlotManager.
 *
 * Tests concurrency control: acquire, release, capacity limits, and usage tracking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SlotManager } from "../slot-manager.js";

let manager: SlotManager;

beforeEach(() => {
  manager = new SlotManager();
});

// ---- canStartAgentRun ----

describe("canStartAgentRun", () => {
  it("returns true when under capacity", () => {
    expect(manager.canStartAgentRun()).toBe(true);
  });

  it("returns true when one slot is used (default max is 3)", () => {
    manager.acquireAgentRun("run-1");
    expect(manager.canStartAgentRun()).toBe(true);
  });

  it("returns true when two slots are used", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    expect(manager.canStartAgentRun()).toBe(true);
  });

  it("returns false when all slots are used", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    manager.acquireAgentRun("run-3");
    expect(manager.canStartAgentRun()).toBe(false);
  });
});

// ---- acquireAgentRun ----

describe("acquireAgentRun", () => {
  it("increments active count on acquire", () => {
    const acquired = manager.acquireAgentRun("run-1");
    expect(acquired).toBe(true);
    expect(manager.getUsage().activeAgentRuns).toBe(1);
  });

  it("increments to two after two acquires", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    expect(manager.getUsage().activeAgentRuns).toBe(2);
  });

  it("returns false when at capacity", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    manager.acquireAgentRun("run-3");
    const acquired = manager.acquireAgentRun("run-4");
    expect(acquired).toBe(false);
    expect(manager.getUsage().activeAgentRuns).toBe(3);
  });

  it("does not duplicate same runId in active count", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-1");
    // Set deduplicates, so active count stays at 1
    expect(manager.getUsage().activeAgentRuns).toBe(1);
  });
});

// ---- releaseAgentRun ----

describe("releaseAgentRun", () => {
  it("decrements active count on release", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    manager.releaseAgentRun("run-1");
    expect(manager.getUsage().activeAgentRuns).toBe(1);
  });

  it("allows re-acquiring after release", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    manager.acquireAgentRun("run-3");
    // All slots used
    expect(manager.canStartAgentRun()).toBe(false);

    manager.releaseAgentRun("run-1");
    // One slot freed
    expect(manager.canStartAgentRun()).toBe(true);
    expect(manager.getUsage().activeAgentRuns).toBe(2);
  });

  it("handles releasing non-existent runId gracefully", () => {
    manager.acquireAgentRun("run-1");
    manager.releaseAgentRun("run-nonexistent");
    expect(manager.getUsage().activeAgentRuns).toBe(1);
  });

  it("can release all and go back to zero", () => {
    manager.acquireAgentRun("run-1");
    manager.acquireAgentRun("run-2");
    manager.releaseAgentRun("run-1");
    manager.releaseAgentRun("run-2");
    expect(manager.getUsage().activeAgentRuns).toBe(0);
    expect(manager.canStartAgentRun()).toBe(true);
  });
});

// ---- Concurrent limit enforcement ----

describe("concurrent limit enforcement", () => {
  it("enforces default limit of 3 agent runs", () => {
    expect(manager.acquireAgentRun("r1")).toBe(true);
    expect(manager.acquireAgentRun("r2")).toBe(true);
    expect(manager.acquireAgentRun("r3")).toBe(true);
    expect(manager.acquireAgentRun("r4")).toBe(false);
  });

  it("respects custom maxConcurrentAgentRuns", () => {
    const custom = new SlotManager({ maxConcurrentAgentRuns: 1 });
    expect(custom.acquireAgentRun("r1")).toBe(true);
    expect(custom.acquireAgentRun("r2")).toBe(false);
  });

  it("enforces external executor limit independently", () => {
    expect(manager.acquireExternalExecutor("p1")).toBe(true);
    expect(manager.acquireExternalExecutor("p2")).toBe(false);
  });

  it("respects custom maxConcurrentExternalExecutors", () => {
    const custom = new SlotManager({ maxConcurrentExternalExecutors: 2 });
    expect(custom.acquireExternalExecutor("p1")).toBe(true);
    expect(custom.acquireExternalExecutor("p2")).toBe(true);
    expect(custom.acquireExternalExecutor("p3")).toBe(false);
  });

  it("tracks agent run and external executor counts independently", () => {
    manager.acquireAgentRun("r1");
    manager.acquireAgentRun("r2");
    manager.acquireExternalExecutor("p1");

    const usage = manager.getUsage();
    expect(usage.activeAgentRuns).toBe(2);
    expect(usage.activeExternalExecutors).toBe(1);
  });

  it("reports capacity in getUsage", () => {
    const usage = manager.getUsage();
    expect(usage.agentRunCapacity).toBe(3);
    expect(usage.externalExecutorCapacity).toBe(1);
  });

  it("updateConfig changes capacity dynamically", () => {
    manager.updateConfig({ maxConcurrentAgentRuns: 5 });
    expect(manager.getUsage().agentRunCapacity).toBe(5);
  });

  it("setAgentRunQueueDepth tracks queue depth", () => {
    manager.setAgentRunQueueDepth(7);
    expect(manager.getUsage().agentRunQueueDepth).toBe(7);
  });
});
