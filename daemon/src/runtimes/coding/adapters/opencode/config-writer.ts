/**
 * OpenCode config writer.
 *
 * Creates per-run temporary configuration files for OpenCode.
 * Each workspace/run is isolated with its own config.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface OpenCodeConfig {
  /** Working directory for the run */
  workDir: string;
  /** Model to use */
  model?: string;
  /** Max tokens */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  permissionPolicy?: "strict" | "normal" | "permissive";
}

/**
 * Create a temporary OpenCode config for a run.
 * Returns the path to the config file.
 */
export function createRunConfig(
  appDataDir: string,
  runId: string,
  config: OpenCodeConfig,
): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    throw new Error(`Invalid OpenCode run ID: ${runId}`);
  }
  const runDir = join(appDataDir, "runs", runId);

  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }

  const permission = config.permissionPolicy === "strict"
    ? { "*": "deny", read: "allow", glob: "allow", grep: "allow", lsp: "allow" }
    : config.permissionPolicy === "permissive"
      ? { "*": "allow", external_directory: "deny" }
      : { "*": "allow", external_directory: "deny", question: "deny" };
  const opencodeConfig = {
    $schema: "https://opencode.ai/config.json",
    ...(config.model && config.model !== "default" ? { model: config.model } : {}),
    permission,
  };

  const configPath = join(runDir, "opencode.json");
  writeFileSync(configPath, JSON.stringify(opencodeConfig, null, 2), "utf-8");

  // Create log directory
  const logDir = join(runDir, "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return configPath;
}

/**
 * Get the run directory for a given run ID.
 */
export function getRunDir(appDataDir: string, runId: string): string {
  return join(appDataDir, "runs", runId);
}
