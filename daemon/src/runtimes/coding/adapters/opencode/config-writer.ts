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
  const runDir = join(appDataDir, "runs", runId);

  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }

  const opencodeConfig = {
    workDir: config.workDir,
    model: config.model ?? "default",
    maxTokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.7,
    logDir: join(runDir, "logs"),
  };

  const configPath = join(runDir, "opencode-config.json");
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
