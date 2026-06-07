import { statSync } from "node:fs";
import type { Sensor, SensorChange } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Config file sensor — watches specified config files for mtime changes.
 */

export interface ConfigSensorOptions {
  /** Paths to watch */
  paths: string[];
  /** Check interval in ms (default 30000) */
  intervalMs?: number;
}

export function createConfigSensor(options: ConfigSensorOptions): Sensor {
  const pathSet = new Set(options.paths);

  // Track last-known mtime per path
  const lastMtimes = new Map<string, number>();

  // Initialize on first check
  let initialized = false;

  return {
    name: "config",
    interval: options.intervalMs ?? 30_000,

    async check(): Promise<SensorChange[] | null> {
      const changes: SensorChange[] = [];

      for (const filePath of pathSet) {
        try {
          const stat = statSync(filePath, { throwIfNoEntry: false });
          if (!stat) continue;

          const mtimeMs = stat.mtimeMs;

          if (!initialized) {
            lastMtimes.set(filePath, mtimeMs);
            continue;
          }

          const prevMtime = lastMtimes.get(filePath);
          if (prevMtime !== undefined && prevMtime !== mtimeMs) {
            changes.push({
              type: "config_file_modified",
              detail: `${filePath} modified`,
            });
          }

          lastMtimes.set(filePath, mtimeMs);
        } catch {
          // File doesn't exist or can't be stat'd — skip
        }
      }

      initialized = true;
      return changes.length > 0 ? changes : null;
    },
  };
}

/**
 * Create a config sensor with default paths:
 * - ./data/config.json
 * - ~/.jarvis/config/mcp-servers.json
 */
export function createDefaultConfigSensor(): Sensor {
  return createConfigSensor({
    paths: [
      join(process.cwd(), "data", "config.json"),
      join(homedir(), ".jarvis", "config", "mcp-servers.json"),
    ],
  });
}
