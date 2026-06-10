import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import * as fs from "node:fs";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

// Must import after mocks are set up
const loader = await import("./loader.js");

describe("loadSkillsFromDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should return empty array when directory does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = loader.loadSkillsFromDirectory("/nonexistent");

    expect(result).toEqual([]);
  });

  it("should load valid skill manifests from JSON files", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["skill-a.json", "skill-b.json"] as any);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        name: "skill-a",
        title: "Skill A",
        description: "desc",
        version: "1.0.0",
        triggers: [],
        toolsUsed: [],
        risk: "low",
        steps: [{ id: "s1", type: "tool_call" }],
      }))
      .mockReturnValueOnce(JSON.stringify({
        name: "skill-b",
        title: "Skill B",
        description: "desc",
        version: "1.0.0",
        triggers: [],
        toolsUsed: [],
        risk: "low",
        steps: [],
      }));

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toHaveLength(2);
    expect(result[0].manifest.name).toBe("skill-a");
    expect(result[1].manifest.name).toBe("skill-b");
    expect(result[0].filePath).toContain("skill-a.json");
  });

  it("should skip files without .json extension", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["readme.txt", "skill.json"] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: "skill",
      title: "S",
      description: "d",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    }));

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toHaveLength(1);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("should skip invalid manifest (missing name)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["bad.json"] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({ title: "No name" }));

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toEqual([]);
  });

  it("should skip invalid manifest (missing steps)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["bad.json"] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: "no-steps" }));

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toEqual([]);
  });

  it("should handle malformed JSON gracefully", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["broken.json"] as any);
    mockReadFileSync.mockReturnValue("not json {{{");

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toEqual([]);
  });

  it("should handle empty directory", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);

    const result = loader.loadSkillsFromDirectory("/skills");

    expect(result).toEqual([]);
  });

  it("should store loaded skills for later retrieval", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["skill.json"] as any);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: "my-skill",
      title: "My Skill",
      description: "d",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    }));

    loader.loadSkillsFromDirectory("/skills");

    const skill = loader.getSkill("my-skill");
    expect(skill).toBeDefined();
    expect(skill!.manifest.name).toBe("my-skill");
  });
});

describe("registerSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should register a skill manifest directly", () => {
    loader.registerSkill({
      name: "inline-skill",
      title: "Inline",
      description: "desc",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    });

    const skill = loader.getSkill("inline-skill");
    expect(skill).toBeDefined();
    expect(skill!.filePath).toBe("<inline>");
  });

  it("should overwrite existing skill with same name", () => {
    loader.registerSkill({
      name: "dup",
      title: "V1",
      description: "d",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    });
    loader.registerSkill({
      name: "dup",
      title: "V2",
      description: "d",
      version: "2.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    });

    const skill = loader.getSkill("dup");
    expect(skill!.manifest.version).toBe("2.0.0");
  });
});

describe("getSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should return undefined for unknown skill", () => {
    expect(loader.getSkill("nonexistent")).toBeUndefined();
  });
});

describe("getAllSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should return all loaded skills", () => {
    loader.registerSkill({
      name: "a", title: "A", description: "d", version: "1.0.0",
      triggers: [], toolsUsed: [], risk: "low", steps: [],
    });
    loader.registerSkill({
      name: "b", title: "B", description: "d", version: "1.0.0",
      triggers: [], toolsUsed: [], risk: "low", steps: [],
    });

    const all = loader.getAllSkills();
    expect(all).toHaveLength(2);
  });

  it("should return empty array when no skills loaded", () => {
    expect(loader.getAllSkills()).toEqual([]);
  });
});

describe("unloadSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should remove a loaded skill", () => {
    loader.registerSkill({
      name: "removable",
      title: "R",
      description: "d",
      version: "1.0.0",
      triggers: [],
      toolsUsed: [],
      risk: "low",
      steps: [],
    });

    const removed = loader.unloadSkill("removable");
    expect(removed).toBe(true);
    expect(loader.getSkill("removable")).toBeUndefined();
  });

  it("should return false for unknown skill", () => {
    expect(loader.unloadSkill("nonexistent")).toBe(false);
  });
});

describe("clearSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loader.clearSkills();
  });

  it("should remove all loaded skills", () => {
    loader.registerSkill({
      name: "a", title: "A", description: "d", version: "1.0.0",
      triggers: [], toolsUsed: [], risk: "low", steps: [],
    });

    loader.clearSkills();
    expect(loader.getAllSkills()).toEqual([]);
  });
});
