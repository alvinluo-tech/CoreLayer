import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageLayout, ensureStorageLayout } from "../storage-layout.js";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("StorageLayout", () => {
  let tempDir: string;
  const originalJarvisHome = process.env.JARVIS_HOME;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-storage-test-"));
  });

  afterEach(() => {
    if (originalJarvisHome !== undefined) {
      process.env.JARVIS_HOME = originalJarvisHome;
    } else {
      delete process.env.JARVIS_HOME;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("respects process.env.JARVIS_HOME override", () => {
    process.env.JARVIS_HOME = tempDir;
    const layout = getStorageLayout();

    expect(layout.rootDir).toBe(tempDir);
    expect(layout.configDir).toBe(tempDir);
    expect(layout.configPath).toBe(join(tempDir, "config.json"));
    expect(layout.credentialsPath).toBe(join(tempDir, "credentials.json"));
    expect(layout.memoryDir).toBe(join(tempDir, "memory"));
    expect(layout.storageDir).toBe(join(tempDir, "storage"));
    expect(layout.worktreesDir).toBe(join(tempDir, "worktrees"));
    expect(layout.cacheDir).toBe(join(tempDir, "cache"));
  });

  it("resolves default production layout when JARVIS_HOME is unset", () => {
    delete process.env.JARVIS_HOME;
    const layout = getStorageLayout();

    expect(layout.rootDir).toContain(".jarvis");
    expect(layout.configDir).toContain("config");
    expect(layout.securityDir).toContain("security");
    expect(layout.memoryDir).toContain("memory");
    expect(layout.storageDir).toContain("storage");
    expect(layout.worktreesDir).toContain("worktrees");
    expect(layout.cacheDir).toContain("cache");
  });

  it("ensures all directories exist upon calling ensureStorageLayout", () => {
    process.env.JARVIS_HOME = tempDir;
    const layout = ensureStorageLayout();

    expect(existsSync(layout.memoryDir)).toBe(true);
    expect(existsSync(layout.journalDir)).toBe(true);
    expect(existsSync(layout.dreamsDir)).toBe(true);
    expect(existsSync(layout.storageDir)).toBe(true);
    expect(existsSync(layout.worktreesDir)).toBe(true);
    expect(existsSync(layout.activeWorktreesDir)).toBe(true);
    expect(existsSync(layout.snapshotsDir)).toBe(true);
    expect(existsSync(layout.cacheDir)).toBe(true);
    expect(existsSync(layout.symbolGraphCacheDir)).toBe(true);
  });
});
