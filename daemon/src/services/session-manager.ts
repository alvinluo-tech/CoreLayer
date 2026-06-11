/**
 * Session Manager — unified file management for conversation-scoped artifacts.
 *
 * Provides a structured directory per conversation:
 *   ~/.jarvis/sessions/{conversationId}/
 *     metadata.json        — session metadata (created, runs, last activity)
 *     artifacts/           — coding run artifacts (JSON)
 *     logs/                — runtime logs
 *     temp/                — temporary files (auto-cleaned)
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { resolveAppPaths } from "../config/app-paths.js";

export interface SessionMetadata {
  conversationId: string;
  createdAt: string;
  lastActivityAt: string;
  runIds: string[];
  artifactCount: number;
}

/** In-memory cache of session metadata */
const sessionCache = new Map<string, SessionMetadata>();

function getSessionsRoot(): string {
  const paths = resolveAppPaths();
  return path.join(paths.appDataDir, "sessions");
}

function getSessionDir(conversationId: string): string {
  return path.join(getSessionsRoot(), conversationId);
}

function getMetadataPath(conversationId: string): string {
  return path.join(getSessionDir(conversationId), "metadata.json");
}

/**
 * Ensure a session directory exists and return its path.
 */
export function ensureSessionDir(conversationId: string): string {
  const dir = getSessionDir(conversationId);
  mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  mkdirSync(path.join(dir, "logs"), { recursive: true });
  mkdirSync(path.join(dir, "temp"), { recursive: true });
  return dir;
}

/**
 * Get or create session metadata.
 */
export function getOrCreateSession(conversationId: string): SessionMetadata {
  const cached = sessionCache.get(conversationId);
  if (cached) return cached;

  const metaPath = getMetadataPath(conversationId);
  if (existsSync(metaPath)) {
    try {
      const raw = readFileSync(metaPath, "utf-8");
      const meta = JSON.parse(raw) as SessionMetadata;
      sessionCache.set(conversationId, meta);
      return meta;
    } catch {
      // Corrupted metadata — recreate
    }
  }

  const meta: SessionMetadata = {
    conversationId,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    runIds: [],
    artifactCount: 0,
  };

  ensureSessionDir(conversationId);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  sessionCache.set(conversationId, meta);
  return meta;
}

/**
 * Record a run in the session and update last activity.
 */
export function recordRunInSession(conversationId: string, runId: string): void {
  const meta = getOrCreateSession(conversationId);
  if (!meta.runIds.includes(runId)) {
    meta.runIds = [...meta.runIds, runId];
  }
  meta.lastActivityAt = new Date().toISOString();
  persistMetadata(conversationId, meta);
}

/**
 * Record an artifact in the session.
 */
export function recordArtifactInSession(conversationId: string): void {
  const meta = getOrCreateSession(conversationId);
  meta.artifactCount++;
  meta.lastActivityAt = new Date().toISOString();
  persistMetadata(conversationId, meta);
}

/**
 * Get the artifacts directory for a session.
 */
export function getSessionArtifactsDir(conversationId: string): string {
  const dir = ensureSessionDir(conversationId);
  return path.join(dir, "artifacts");
}

/**
 * Get the logs directory for a session.
 */
export function getSessionLogsDir(conversationId: string): string {
  const dir = ensureSessionDir(conversationId);
  return path.join(dir, "logs");
}

/**
 * Get the temp directory for a session.
 */
export function getSessionTempDir(conversationId: string): string {
  const dir = ensureSessionDir(conversationId);
  return path.join(dir, "temp");
}

/**
 * List all sessions with their metadata.
 */
export function listSessions(): SessionMetadata[] {
  const root = getSessionsRoot();
  if (!existsSync(root)) return [];

  const sessions: SessionMetadata[] = [];
  for (const entry of readdirSync(root)) {
    const metaPath = path.join(root, entry, "metadata.json");
    if (existsSync(metaPath)) {
      try {
        const raw = readFileSync(metaPath, "utf-8");
        sessions.push(JSON.parse(raw) as SessionMetadata);
      } catch {
        // Skip corrupted sessions
      }
    }
  }
  return sessions;
}

/**
 * Clean up temp files in a session.
 */
export function cleanSessionTemp(conversationId: string): void {
  const tempDir = getSessionTempDir(conversationId);
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  }
}

/**
 * Delete an entire session and its files.
 */
export function deleteSession(conversationId: string): void {
  const dir = getSessionDir(conversationId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  sessionCache.delete(conversationId);
}

/**
 * Clean up sessions older than maxAgeMs.
 * Returns the number of sessions deleted.
 */
export function cleanupStaleSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  const sessions = listSessions();
  let deleted = 0;

  for (const session of sessions) {
    const lastActivity = new Date(session.lastActivityAt).getTime();
    if (now - lastActivity > maxAgeMs) {
      deleteSession(session.conversationId);
      deleted++;
    }
  }
  return deleted;
}

function persistMetadata(conversationId: string, meta: SessionMetadata): void {
  ensureSessionDir(conversationId);
  writeFileSync(getMetadataPath(conversationId), JSON.stringify(meta, null, 2), "utf-8");
}
