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

  // SQLite path: keep relative env paths relative to the daemon process cwd.
  // This preserves the existing dev .env value "./data/jarvis.db".
  const envSqlitePath = process.env.SQLITE_DB_PATH;
  const sqlitePath = envSqlitePath
    ? path.resolve(process.cwd(), envSqlitePath)
    : path.join(isSidecar ? dataDir : appDataDir, "jarvis.db");

  return { appDataDir, configDir, dataDir, logDir, sqlitePath };
}

function getDefaultAppDataDir(): string {
  // Dev mode can run with cwd at repo root or at the daemon package root.
  // Keep both cases pointed at the historical daemon/data directory.
  const cwd = process.cwd();
  return path.basename(cwd) === "daemon"
    ? path.resolve(cwd, "data")
    : path.resolve(cwd, "daemon", "data");
}

/**
 * Ensure all required directories exist.
 */
export function ensureAppDirs(paths: AppPaths): void {
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}
