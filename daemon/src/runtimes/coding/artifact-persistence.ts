/**
 * Artifact Persistence — writes coding run artifacts to disk.
 *
 * Artifacts are stored under JARVIS_APP_DATA_DIR/artifacts/{runId}/
 * as individual JSON files plus a manifest.
 */

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { resolveAppPaths } from "../../config/app-paths.js";
import type { CodingArtifact } from "./types.js";

/** In-memory artifact registry keyed by runId */
const artifactRegistry = new Map<string, CodingArtifact[]>();

function getArtifactsDir(): string {
  const paths = resolveAppPaths();
  return path.join(paths.appDataDir, "artifacts");
}

function getRunArtifactDir(runId: string): string {
  return path.join(getArtifactsDir(), runId);
}

/**
 * Persist artifacts for a coding run to disk and cache in memory.
 */
export function persistArtifacts(
  runId: string,
  artifacts: CodingArtifact[],
): void {
  if (artifacts.length === 0) return;

  // Cache in memory
  artifactRegistry.set(runId, artifacts);

  // Write to disk
  try {
    const dir = getRunArtifactDir(runId);
    mkdirSync(dir, { recursive: true });

    // Write manifest
    const manifest = {
      runId,
      artifactCount: artifacts.length,
      persistedAt: new Date().toISOString(),
      artifacts: artifacts.map((a, i) => ({
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

    // Write individual artifact files
    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      writeFileSync(
        path.join(dir, `artifact-${i}.json`),
        JSON.stringify(artifact, null, 2),
        "utf-8",
      );
    }
  } catch {
    // File persistence is best-effort — in-memory cache still works
  }
}

/**
 * Retrieve artifacts for a run (from memory cache, or null if not found).
 */
export function getArtifacts(runId: string): CodingArtifact[] | null {
  return artifactRegistry.get(runId) ?? null;
}
