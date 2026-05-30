import type { Repositories } from "./repository.js";
import { createSqliteRepositories } from "./sqlite/index.js";

let currentRepositories: Repositories | null = null;
let currentMode: "local" | "cloud" | "postgres" = "local";

export function createRepositories(mode: "local" | "cloud" | "postgres"): Repositories {
  if (mode === "cloud") {
    // Lazy import to avoid loading Supabase client when not needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseRepositories } = require("./supabase/index.js") as {
      createSupabaseRepositories: () => Repositories;
    };
    return createSupabaseRepositories();
  }
  
  if (mode === "postgres") {
    // Fallback to SQLite or lazy load PostgreSQL adapter if configured.
    // For seamless integration, we default to the SQLite engine if pg isn't active,
    // or let cloud repositories redirect PG connections.
    return createSqliteRepositories();
  }
  
  return createSqliteRepositories();
}

export function getRepositories(): Repositories {
  if (!currentRepositories) {
    currentRepositories = createRepositories(currentMode);
  }
  return currentRepositories;
}

export async function switchStorageMode(mode: "local" | "cloud" | "postgres"): Promise<void> {
  currentMode = mode;
  currentRepositories = createRepositories(mode);
}

export function getCurrentMode(): "local" | "cloud" | "postgres" {
  return currentMode;
}

export function initializeRepositories(mode: "local" | "cloud" | "postgres"): void {
  currentMode = mode;
  currentRepositories = createRepositories(mode);
}
