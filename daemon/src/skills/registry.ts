import type { JarvisTool, ToolResult } from "@jarvis/types";
import { registerJarvisTool } from "../runtimes/tool/adapters/native-tools/registry.js";
import { getAllSkills, loadSkillsFromDirectory } from "./loader.js";
import { executeSkill } from "./executor.js";
import type { LoadedSkill } from "./types.js";

/**
 * Load skills from directory and register them as tools in the ToolRegistry.
 */
export function loadAndRegisterSkills(skillsDir: string): number {
  const loaded = loadSkillsFromDirectory(skillsDir);
  for (const skill of loaded) {
    registerSkillAsTool(skill);
  }
  return loaded.length;
}

/**
 * Register all currently loaded skills as tools.
 */
export function registerAllLoadedSkills(): number {
  const skills = getAllSkills();
  for (const skill of skills) {
    registerSkillAsTool(skill);
  }
  return skills.length;
}

/**
 * Register a single skill as a JarvisTool in the ToolRegistry.
 */
export function registerSkillAsTool(skill: LoadedSkill): void {
  const { manifest } = skill;

  const tool: JarvisTool = {
    id: `skill:${manifest.name}`,
    appId: "jarvis",
    source: "skill",
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    inputSchema: manifest.inputSchema ?? { type: "object", properties: {} },
    risk: manifest.risk,
    permissions: [],
    requiresConfirmation: manifest.risk === "high" || manifest.risk === "critical",
    execute: async (args: unknown): Promise<ToolResult> => {
      const result = await executeSkill(manifest.name, args as Record<string, unknown>);
      return {
        success: result.success,
        data: result.output,
        error: result.error,
      };
    },
  };

  registerJarvisTool(tool);
}
