import path from "path";
import { mkdirSync } from "fs";

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
 * In dev mode, paths fall back to repo-relative locations.
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

  // SQLite path: use env var if set, otherwise under data dir
  const envSqlitePath = process.env.SQLITE_DB_PATH;
  const sqlitePath = envSqlitePath && !envSqlitePath.startsWith("./")
    ? envSqlitePath
    : path.join(dataDir, "jarvis.db");

  return { appDataDir, configDir, dataDir, logDir, sqlitePath };
}

function getDefaultAppDataDir(): string {
  // Dev mode: use repo-relative path
  return path.resolve(process.cwd(), "daemon", "data");
}

/**
 * Ensure all required directories exist.
 */
export function ensureAppDirs(paths: AppPaths): void {
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}
