/**
 * Persistent secret store for API keys and other credentials.
 *
 * Stores secrets in a JSON file at JARVIS_APP_DATA_DIR/secrets.json.
 * File permissions are set to 0o600 on Unix (owner read/write only).
 * All file operations are best-effort — failures are caught and logged
 * rather than thrown.
 */

import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const SECRETS_FILENAME = "secrets.json";

export class SecretStore {
  private readonly filePath: string;
  private cache: Map<string, string> | null = null;

  constructor(appDataDir: string) {
    this.filePath = join(appDataDir, SECRETS_FILENAME);
  }

  /**
   * Store a secret value. Creates the secrets file if it does not exist.
   */
  set(key: string, value: string): void {
    const data = this.load();
    data.set(key, value);
    this.save(data);
  }

  /**
   * Retrieve a secret value by key. Returns undefined if not found.
   */
  get(key: string): string | undefined {
    const data = this.load();
    return data.get(key);
  }

  /**
   * Remove a secret by key. No-op if the key does not exist.
   */
  delete(key: string): void {
    const data = this.load();
    data.delete(key);
    this.save(data);
  }

  /**
   * List all stored secret keys (not values).
   */
  list(): string[] {
    const data = this.load();
    return Array.from(data.keys());
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private load(): Map<string, string> {
    if (this.cache !== null) {
      return this.cache;
    }

    try {
      if (!existsSync(this.filePath)) {
        this.cache = new Map();
        return this.cache;
      }

      const raw = readFileSync(this.filePath, "utf-8");
      const parsed: Record<string, string> = JSON.parse(raw);
      this.cache = new Map(Object.entries(parsed));
    } catch {
      // File read or parse failure — start fresh
      this.cache = new Map();
    }

    return this.cache;
  }

  private save(data: Map<string, string>): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const obj = Object.fromEntries(data);
      writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf-8");

      // Best-effort: restrict file permissions on Unix
      try {
        chmodSync(this.filePath, 0o600);
      } catch {
        // chmod not available on Windows — ignore
      }
    } catch {
      // File write failure — silently ignore (best-effort)
    }

    // Always update cache so in-memory state stays consistent
    this.cache = data;
  }

  /**
   * Reset the in-memory cache, forcing a re-read from disk on next access.
   * Useful for testing.
   */
  resetCache(): void {
    this.cache = null;
  }
}
