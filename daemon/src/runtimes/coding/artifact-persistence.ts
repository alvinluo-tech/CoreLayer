/**
 * Artifact Persistence — writes coding run artifacts to disk.
 *
 * Artifacts are stored under JARVIS_APP_DATA_DIR/artifacts/{runId}/
 * as individual JSON files plus a manifest.
 *
 * When a conversationId is provided, artifacts are also written to
 * the session directory: JARVIS_APP_DATA_DIR/sessions/{conversationId}/artifacts/
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { resolveAppPaths } from "../../config/app-paths.js";
import { ensureSessionDir, recordArtifactInSession } from "../../services/session-manager.js";
import { emitWorkspaceEvent } from "../../services/workspace-event-emitter.js";
import type { CodingArtifact, DurableCodingArtifactType } from "./types.js";

export interface ArtifactEventContext {
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentRunId?: string;
  runtimeId?: string;
}

/** In-memory artifact registry keyed by runId */
const artifactRegistry = new Map<string, CodingArtifact[]>();

const PERSISTABLE_ARTIFACT_TYPES = new Set<DurableCodingArtifactType>([
  "changed_files",
  "diff_summary",
  "test_report",
  "generated_file",
  "log_path",
]);

export function isPersistableCodingArtifact(artifact: CodingArtifact): boolean {
  return PERSISTABLE_ARTIFACT_TYPES.has(artifact.type as DurableCodingArtifactType);
}

function getArtifactsDir(): string {
  const paths = resolveAppPaths();
  return path.join(paths.appDataDir, "artifacts");
}

function getRunArtifactDir(runId: string): string {
  return path.join(getArtifactsDir(), runId);
}

/**
 * Persist artifacts for a coding run to disk and cache in memory.
 * Optionally also writes to the session directory when conversationId is provided.
 * When eventContext is provided, emits workspace.artifact.created events.
 */
export function persistArtifacts(
  runId: string,
  artifacts: CodingArtifact[],
  conversationId?: string,
  eventContext?: ArtifactEventContext,
): void {
  const persistableArtifacts = artifacts.filter(isPersistableCodingArtifact);
  if (persistableArtifacts.length === 0) return;

  // Cache only durable deliverables. Status messages remain on the run record.
  artifactRegistry.set(runId, persistableArtifacts);

  // Emit artifact created events when context is provided
  if (eventContext?.workspaceId) {
    for (let i = 0; i < persistableArtifacts.length; i++) {
      const artifact = persistableArtifacts[i];
      emitWorkspaceEvent({
        type: "workspace.artifact.created",
        title: `Artifact: ${artifact.type}`,
        summary: artifact.content?.slice(0, 80) ?? artifact.type,
        workspaceId: eventContext.workspaceId,
        projectId: eventContext.projectId,
        taskId: eventContext.taskId,
        agentRunId: eventContext.agentRunId,
        runtimeId: eventContext.runtimeId,
        artifactId: `${runId}-${i}`,
        payload: {
          workspaceId: eventContext.workspaceId,
          projectId: eventContext.projectId,
          taskId: eventContext.taskId,
          agentRunId: eventContext.agentRunId,
          artifactType: artifact.type,
          artifactIndex: i,
          metadata: artifact.metadata,
        },
      });
    }
  }

  // Write to run-specific directory
  try {
    const dir = getRunArtifactDir(runId);
    mkdirSync(dir, { recursive: true });

    const manifest = {
      runId,
      conversationId: conversationId ?? null,
      artifactCount: persistableArtifacts.length,
      persistedAt: new Date().toISOString(),
      artifacts: persistableArtifacts.map((a, i) => ({
        index: i,
        type: a.type,
        metadata: a.metadata,
        file: `artifact-${i}.json`,
      })),
    };
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    for (let i = 0; i < persistableArtifacts.length; i++) {
      const artifact = persistableArtifacts[i];
      writeFileSync(
        path.join(dir, `artifact-${i}.json`),
        JSON.stringify(artifact, null, 2),
        "utf-8",
      );
    }
  } catch {
    // File persistence is best-effort — in-memory cache still works
  }

  // Also write to session directory when conversationId is provided
  if (conversationId) {
    try {
      const sessionArtifactsDir = path.join(ensureSessionDir(conversationId), "artifacts");
      mkdirSync(sessionArtifactsDir, { recursive: true });

      // Write a symlink-style reference file pointing to the run artifacts
      const ref = {
        runId,
        type: "run-artifacts",
        artifactCount: persistableArtifacts.length,
        persistedAt: new Date().toISOString(),
      };
      writeFileSync(
        path.join(sessionArtifactsDir, `${runId}.json`),
        JSON.stringify(ref, null, 2),
        "utf-8",
      );

      recordArtifactInSession(conversationId);
    } catch {
      // Best-effort session copy
    }
  }
}

/**
 * Retrieve artifacts for a run. Returns from in-memory cache if available,
 * otherwise attempts to load from disk and populate the cache.
 */
export function getArtifacts(runId: string): CodingArtifact[] | null {
  const cached = artifactRegistry.get(runId);
  if (cached) return cached;

  // Try loading from disk
  const dir = getRunArtifactDir(runId);
  if (!existsSync(dir)) return null;

  try {
    const manifestPath = path.join(dir, "manifest.json");
    if (!existsSync(manifestPath)) return null;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      artifactCount: number;
    };

    const artifacts: CodingArtifact[] = [];
    for (let i = 0; i < manifest.artifactCount; i++) {
      const artifactPath = path.join(dir, `artifact-${i}.json`);
      if (existsSync(artifactPath)) {
        artifacts.push(JSON.parse(readFileSync(artifactPath, "utf-8")) as CodingArtifact);
      }
    }

    if (artifacts.length > 0) {
      artifactRegistry.set(runId, artifacts);
      return artifacts;
    }
  } catch {
    // Corrupted or unreadable — fall through to null
  }

  return null;
}
