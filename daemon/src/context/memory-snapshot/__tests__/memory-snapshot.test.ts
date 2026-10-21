import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadFrozenMemorySnapshot,
  appendToMemoryMarkdown,
} from "../memory-snapshot.js";
import { getStorageLayout, type JarvisStorageLayout } from "../../../config/storage-layout.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Memory Snapshot & Living Markdown Files", () => {
  let tempDir: string;
  let testLayout: JarvisStorageLayout;
  const originalJarvisHome = process.env.JARVIS_HOME;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "jarvis-memory-test-"));
    process.env.JARVIS_HOME = tempDir;
    testLayout = getStorageLayout();
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

  it("initializes default USER.md and MEMORY.md when files do not exist", () => {
    expect(existsSync(testLayout.userMarkdownPath)).toBe(false);
    expect(existsSync(testLayout.memoryMarkdownPath)).toBe(false);

    const snapshot = loadFrozenMemorySnapshot(testLayout);

    expect(existsSync(testLayout.userMarkdownPath)).toBe(true);
    expect(existsSync(testLayout.memoryMarkdownPath)).toBe(true);
    expect(snapshot.hasContent).toBe(true);
    expect(snapshot.userProfileText).toContain("USER PROFILE");
    expect(snapshot.memoryText).toContain("LONG-TERM FACTUAL MEMORY");
  });

  it("reads custom content from existing Markdown memory files", () => {
    // Write custom profile before loading
    loadFrozenMemorySnapshot(testLayout); // bootstrap dir
    writeFileSync(testLayout.userMarkdownPath, "# Custom User\n- Prefers TypeScript", "utf-8");
    writeFileSync(testLayout.memoryMarkdownPath, "# Custom Facts\n- Project X uses PostgreSQL", "utf-8");

    const snapshot = loadFrozenMemorySnapshot(testLayout);
    expect(snapshot.userProfileText).toContain("Prefers TypeScript");
    expect(snapshot.memoryText).toContain("Project X uses PostgreSQL");
  });

  it("appends to MEMORY.md on disk without mutating the in-flight frozen snapshot", () => {
    const snapshotBefore = loadFrozenMemorySnapshot(testLayout);
    const originalText = snapshotBefore.memoryText;

    appendToMemoryMarkdown("Learned new user habit: prefers tabs", testLayout);

    // On-disk file should now contain the new habit
    const diskText = readFileSync(testLayout.memoryMarkdownPath, "utf-8");
    expect(diskText).toContain("prefers tabs");

    // In-flight frozen snapshot object must remain completely unaltered for prompt cache preservation
    expect(snapshotBefore.memoryText).toBe(originalText);
    expect(snapshotBefore.memoryText).not.toContain("prefers tabs");
  });
});
