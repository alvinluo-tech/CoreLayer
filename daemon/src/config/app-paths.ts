import path from "path";
import { mkdirSync } from "fs";
import { homedir } from "os";

export interface AppPaths {
  appDataDir: string;
  configDir: string;
  dataDir: string;
  logDir: string;
  sqlitePath: string;
}

/**
 * Resolve application paths based on runtime mode.
 *
 * In sidecar mode (JARVIS_RUNTIME_MODE=sidecar), paths are set by the
 * Tauri supervisor via environment variables.
 *
 * In dev mode, paths default to ~/.jarvis/ — consistent with
 * config-manager and mcp-config which already use that location.
 */
export function resolveAppPaths(): AppPaths {
  const runtimeMode = process.env.JARVIS_RUNTIME_MODE ?? "dev";
  const isSidecar = runtimeMode === "sidecar";

  const appDataDir = isSidecar
    ? (process.env.JARVIS_APP_DATA_DIR ?? getDefaultAppDataDir())
    : getDefaultAppDataDir();

  const configDir = path.join(appDataDir, "config");
  const dataDir = path.join(appDataDir, "data");
  const logDir = isSidecar
    ? (process.env.JARVIS_LOG_DIR ?? path.join(appDataDir, "logs"))
    : path.join(appDataDir, "logs");

  // SQLite path: resolve env paths against appDataDir, not cwd.
  // Absolute env paths are used as-is; relative paths resolve under appDataDir.
  const envSqlitePath = process.env.SQLITE_DB_PATH;
  const sqlitePath = envSqlitePath
    ? path.isAbsolute(envSqlitePath)
      ? envSqlitePath
      : path.resolve(appDataDir, envSqlitePath)
    : path.join(appDataDir, "data", "jarvis.db");

  return { appDataDir, configDir, dataDir, logDir, sqlitePath };
}

function getDefaultAppDataDir(): string {
  return path.join(homedir(), ".jarvis");
}

/**
 * Ensure all required directories exist.
 */
export function ensureAppDirs(paths: AppPaths): void {
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}
