import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillManifest, LoadedSkill } from "./types.js";

const loadedSkills = new Map<string, LoadedSkill>();

/**
 * Load all skill manifests from a directory.
 * Each skill is a JSON file with a SkillManifest structure.
 */
export function loadSkillsFromDirectory(dirPath: string): LoadedSkill[] {
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json"));
  const skills: LoadedSkill[] = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const manifest = JSON.parse(content) as SkillManifest;

      if (!manifest.name || !manifest.steps) {
        console.warn(`[Skills] Skipping invalid skill file: ${file}`);
        continue;
      }

      const loaded: LoadedSkill = {
        manifest,
        filePath,
        loadedAt: new Date().toISOString(),
      };

      loadedSkills.set(manifest.name, loaded);
      skills.push(loaded);
    } catch (err) {
      console.error(`[Skills] Failed to load skill from ${file}:`, err);
    }
  }

  return skills;
}

/**
 * Register a single skill manifest directly (e.g., from API or inline definition).
 */
export function registerSkill(manifest: SkillManifest): void {
  loadedSkills.set(manifest.name, {
    manifest,
    filePath: "<inline>",
    loadedAt: new Date().toISOString(),
  });
}

/**
 * Get a loaded skill by name.
 */
export function getSkill(name: string): LoadedSkill | undefined {
  return loadedSkills.get(name);
}

/**
 * Get all loaded skills.
 */
export function getAllSkills(): LoadedSkill[] {
  return Array.from(loadedSkills.values());
}

/**
 * Unload a skill by name.
 */
export function unloadSkill(name: string): boolean {
  return loadedSkills.delete(name);
}

/**
 * Clear all loaded skills.
 */
export function clearSkills(): void {
  loadedSkills.clear();
}
