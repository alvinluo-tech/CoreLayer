/**
 * Memory Snapshot — explicit Markdown memory source of truth with prompt-caching frozen snapshots.
 *
 * Inspired by Hermes Agent and OpenClaw:
 * - "The model only remembers what gets saved to disk; there is no hidden state."
 * - USER.md and MEMORY.md live as human-readable, human-editable Markdown files on disk.
 * - At session/turn start, an immutable FROZEN snapshot is loaded into the prompt prefix.
 * - Mid-session writes hit disk and SQLite FTS, but NEVER mutate the active turn's prefix,
 *   guaranteeing 100% Anthropic / local KV-cache hit rate.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getStorageLayout, type JarvisStorageLayout } from "../../config/storage-layout.js";

export interface FrozenMemorySnapshot {
  userProfileText: string;
  memoryText: string;
  snapshotTimestamp: number;
  hasContent: boolean;
}

const DEFAULT_USER_MD = `# USER PROFILE & HARD CONSTRAINTS
- Role: Software Engineer / Architect
- Preferred Language: Chinese (中文)
- Code Style: Clean, robust, type-safe, minimal comments stating constraints only
`;

const DEFAULT_MEMORY_MD = `# LONG-TERM FACTUAL MEMORY
- CoreLayer / Jarvis is a desktop-native autonomous agent runtime.
`;

/**
 * Loads or initializes the frozen Markdown memory snapshot for an execution turn.
 */
export function loadFrozenMemorySnapshot(
  customLayout?: JarvisStorageLayout,
): FrozenMemorySnapshot {
  const layout = customLayout ?? getStorageLayout();

  let userProfileText = "";
  let memoryText = "";

  // 1. Ensure USER.md exists and read it
  if (!existsSync(layout.userMarkdownPath)) {
    try {
      mkdirSync(dirname(layout.userMarkdownPath), { recursive: true });
      writeFileSync(layout.userMarkdownPath, DEFAULT_USER_MD, "utf-8");
      userProfileText = DEFAULT_USER_MD;
    } catch {
      userProfileText = "";
    }
  } else {
    try {
      userProfileText = readFileSync(layout.userMarkdownPath, "utf-8");
    } catch {
      userProfileText = "";
    }
  }

  // 2. Ensure MEMORY.md exists and read it
  if (!existsSync(layout.memoryMarkdownPath)) {
    try {
      mkdirSync(dirname(layout.memoryMarkdownPath), { recursive: true });
      writeFileSync(layout.memoryMarkdownPath, DEFAULT_MEMORY_MD, "utf-8");
      memoryText = DEFAULT_MEMORY_MD;
    } catch {
      memoryText = "";
    }
  } else {
    try {
      memoryText = readFileSync(layout.memoryMarkdownPath, "utf-8");
    } catch {
      memoryText = "";
    }
  }

  return {
    userProfileText: userProfileText.trim(),
    memoryText: memoryText.trim(),
    snapshotTimestamp: Date.now(),
    hasContent: userProfileText.trim().length > 0 || memoryText.trim().length > 0,
  };
}

/**
 * Appends a new fact or preference to MEMORY.md on disk.
 * Note: Modifying disk does NOT alter any in-flight frozen turn snapshots.
 */
export function appendToMemoryMarkdown(
  fact: string,
  customLayout?: JarvisStorageLayout,
): void {
  const layout = customLayout ?? getStorageLayout();
  const cleanFact = fact.trim();
  if (!cleanFact) return;

  try {
    mkdirSync(dirname(layout.memoryMarkdownPath), { recursive: true });
    let current = "";
    if (existsSync(layout.memoryMarkdownPath)) {
      current = readFileSync(layout.memoryMarkdownPath, "utf-8");
    }
    const updated = `${current.trimEnd()}\n- ${cleanFact}\n`;
    writeFileSync(layout.memoryMarkdownPath, updated, "utf-8");
  } catch {
    // Best-effort append
  }
}
