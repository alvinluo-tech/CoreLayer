import type { Repositories } from "./repository.js";
import { createSqliteRepositories } from "./sqlite/index.js";
import { createSupabaseRepositories } from "./supabase/index.js";

let currentRepositories: Repositories | null = null;
let currentMode: "local" | "cloud" | "postgres" = "local";

export function createRepositories(mode: "local" | "cloud" | "postgres"): Repositories {
  if (mode === "cloud") {
    return createSupabaseRepositories();
  }
  
  if (mode === "postgres") {
    // PostgreSQL adapter not yet implemented — fall back to SQLite with a warning.
    console.warn("[Jarvis] PostgreSQL mode requested but not implemented, falling back to SQLite");
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
