import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./loader.js", () => ({
  loadSkillsFromDirectory: vi.fn(),
  getAllSkills: vi.fn(),
}));

vi.mock("./executor.js", () => ({
  executeSkill: vi.fn(),
}));

vi.mock("../runtimes/tool/public-api.js", () => ({
  registerJarvisTool: vi.fn(),
}));

import { loadAndRegisterSkills, registerAllLoadedSkills, registerSkillAsTool } from "./registry.js";
import { loadSkillsFromDirectory, getAllSkills } from "./loader.js";
import { executeSkill } from "./executor.js";
import { registerJarvisTool } from "../runtimes/tool/public-api.js";

const mockLoadSkillsFromDirectory = vi.mocked(loadSkillsFromDirectory);
const mockGetAllSkills = vi.mocked(getAllSkills);
const mockExecuteSkill = vi.mocked(executeSkill);
const mockRegisterJarvisTool = vi.mocked(registerJarvisTool);

function makeLoadedSkill(overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      name: "test-skill",
      title: "Test Skill",
      description: "A test skill",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low" as const,
      steps: [],
      ...overrides,
    },
    filePath: "<test>",
    loadedAt: new Date().toISOString(),
  };
}

describe("loadAndRegisterSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load skills and register each as a tool", () => {
    const skills = [
      makeLoadedSkill({ name: "skill-a" }),
      makeLoadedSkill({ name: "skill-b" }),
    ];
    mockLoadSkillsFromDirectory.mockReturnValue(skills);

    const count = loadAndRegisterSkills("/skills/dir");

    expect(count).toBe(2);
    expect(mockRegisterJarvisTool).toHaveBeenCalledTimes(2);
  });

  it("should return 0 when no skills found", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([]);

    const count = loadAndRegisterSkills("/empty");

    expect(count).toBe(0);
    expect(mockRegisterJarvisTool).not.toHaveBeenCalled();
  });

  it("should register tool with correct id prefix", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([makeLoadedSkill({ name: "my-skill" })]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.id).toBe("skill:my-skill");
    expect(toolArg.source).toBe("skill");
    expect(toolArg.appId).toBe("jarvis");
  });

  it("should set requiresConfirmation for high risk skills", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([
      makeLoadedSkill({ name: "dangerous", risk: "high" }),
    ]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.requiresConfirmation).toBe(true);
  });

  it("should set requiresConfirmation for critical risk skills", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([
      makeLoadedSkill({ name: "critical", risk: "critical" }),
    ]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.requiresConfirmation).toBe(true);
  });

  it("should not require confirmation for low risk skills", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([
      makeLoadedSkill({ name: "safe", risk: "low" }),
    ]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.requiresConfirmation).toBe(false);
  });

  it("should use inputSchema from manifest when provided", () => {
    const schema = { type: "object", properties: { query: { type: "string" } } };
    mockLoadSkillsFromDirectory.mockReturnValue([
      makeLoadedSkill({ name: "schema-skill", inputSchema: schema }),
    ]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.inputSchema).toEqual(schema);
  });

  it("should use empty schema as default when inputSchema not provided", () => {
    mockLoadSkillsFromDirectory.mockReturnValue([makeLoadedSkill()]);

    loadAndRegisterSkills("/skills");

    const toolArg = mockRegisterJarvisTool.mock.calls[0][0];
    expect(toolArg.inputSchema).toEqual({ type: "object", properties: {} });
  });
});

describe("registerAllLoadedSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register all currently loaded skills", () => {
    mockGetAllSkills.mockReturnValue([
      makeLoadedSkill({ name: "loaded-a" }),
      makeLoadedSkill({ name: "loaded-b" }),
    ]);

    const count = registerAllLoadedSkills();

    expect(count).toBe(2);
    expect(mockRegisterJarvisTool).toHaveBeenCalledTimes(2);
  });

  it("should return 0 when no skills loaded", () => {
    mockGetAllSkills.mockReturnValue([]);

    const count = registerAllLoadedSkills();

    expect(count).toBe(0);
  });
});

describe("registerSkillAsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a JarvisTool and register it", () => {
    const skill = makeLoadedSkill({ name: "single-skill" });

    registerSkillAsTool(skill);

    expect(mockRegisterJarvisTool).toHaveBeenCalledTimes(1);
    const tool = mockRegisterJarvisTool.mock.calls[0][0];
    expect(tool.name).toBe("single-skill");
    expect(tool.title).toBe("Test Skill");
    expect(tool.description).toBe("A test skill");
  });

  it("should call executeSkill when tool.execute is invoked", async () => {
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillName: "test",
      steps: [],
      output: { result: "done" },
      durationMs: 10,
    });

    registerSkillAsTool(makeLoadedSkill());

    const tool = mockRegisterJarvisTool.mock.calls[0][0];
    const result = await tool.execute({ query: "hello" });

    expect(mockExecuteSkill).toHaveBeenCalledWith("test-skill", { query: "hello" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: "done" });
  });

  it("should map error from executeSkill to ToolResult", async () => {
    mockExecuteSkill.mockResolvedValue({
      success: false,
      skillName: "test",
      steps: [],
      output: null,
      durationMs: 10,
      error: "something went wrong",
    });

    registerSkillAsTool(makeLoadedSkill());

    const tool = mockRegisterJarvisTool.mock.calls[0][0];
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("something went wrong");
  });

  it("should pass risk level to tool", () => {
    registerSkillAsTool(makeLoadedSkill({ name: "risky", risk: "medium" }));

    const tool = mockRegisterJarvisTool.mock.calls[0][0];
    expect(tool.risk).toBe("medium");
  });
});
