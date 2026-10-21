import { describe, it, expect, vi } from "vitest";

const mockRegisterRuntime = vi.hoisted(() => vi.fn());

vi.mock("../runtime-host/registry.js", () => ({
  registerRuntime: (...args: unknown[]) => mockRegisterRuntime(...args),
}));

vi.mock("./agent/agent-runtime.js", () => ({
  AgentRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./voice/voice-runtime.js", () => ({
  VoiceRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./scheduler/scheduler-runtime.js", () => ({
  SchedulerRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./computer-control/computer-control-runtime-facade.js", () => ({
  ComputerControlRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./tool/tool-runtime.js", () => ({
  ToolRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./coding/coding-runtime.js", () => ({
  CodingRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

vi.mock("./memory/memory-runtime.js", () => ({
  MemoryRuntime: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    kind: config.kind,
    id: config.id,
    version: config.version,
  })),
}));

const module = await import("./index.js");

describe("Runtimes Index", () => {
  it("registers agent runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ kind: "agent", id: "agent-runtime" }),
    );
  });

  it("registers tool runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "tool",
      expect.objectContaining({ kind: "tool", id: "tool-runtime" }),
    );
  });

  it("registers voice runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "voice",
      expect.objectContaining({ kind: "voice", id: "voice-runtime" }),
    );
  });

  it("registers scheduler runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "scheduler",
      expect.objectContaining({ kind: "scheduler", id: "scheduler-runtime" }),
    );
  });

  // Computer control is constructed but deliberately unregistered: its
  // permission and audit layers are finished while the OS capability layer is
  // still a stub. Registering it would advertise a runtime that reports
  // "running" and accepts operations without performing them.
  it("does not register computer-control runtime", () => {
    expect(mockRegisterRuntime).not.toHaveBeenCalledWith(
      "computer-control",
      expect.anything(),
    );
  });

  it("registers coding runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "coding",
      expect.objectContaining({ kind: "coding", id: "coding-runtime" }),
    );
  });

  it("registers memory runtime", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledWith(
      "memory",
      expect.objectContaining({ kind: "memory", id: "memory-runtime" }),
    );
  });

  it("registers exactly 6 runtimes", () => {
    expect(mockRegisterRuntime).toHaveBeenCalledTimes(6);
  });

  it("exports runtime instances", () => {
    expect(module.agentRuntime).toBeDefined();
    expect(module.toolRuntimeFacade).toBeDefined();
    expect(module.voiceRuntime).toBeDefined();
    expect(module.schedulerRuntime).toBeDefined();
    expect(module.computerControlRuntime).toBeDefined();
    expect(module.codingRuntime).toBeDefined();
    expect(module.memoryRuntime).toBeDefined();
  });

  it("agent runtime has correct config", () => {
    expect(module.agentRuntime).toEqual(
      expect.objectContaining({
        id: "agent-runtime",
        kind: "agent",
        version: "1.0.0",
      }),
    );
  });

  it("tool runtime has correct config", () => {
    expect(module.toolRuntimeFacade).toEqual(
      expect.objectContaining({
        id: "tool-runtime",
        kind: "tool",
        version: "1.0.0",
      }),
    );
  });
});
