import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { resolveAppPaths, ensureAppDirs } from "../config/app-paths.js";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { runDbMigrations } from "./migrator.js";

type BetterSqlite3Constructor = new (
  filename: string,
  options?: import("better-sqlite3").Options,
) => import("better-sqlite3").Database;

const appPaths = resolveAppPaths();
ensureAppDirs(appPaths);
const dbPath = appPaths.sqlitePath;
mkdirSync(dirname(dbPath), { recursive: true });

const sidecarModuleRoot = process.env.JARVIS_SIDECAR_MODULE_ROOT || dirname(process.execPath);
const requireFromSidecarDir = createRequire(join(sidecarModuleRoot, "package.json"));
const Database = requireFromSidecarDir("better-sqlite3") as BetterSqlite3Constructor;
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Run compiled Drizzle & legacy migrations
runDbMigrations(sqlite);

const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

export { db };
export { schema };
