/**
 * Resolve the acpx CLI entrypoint used to drive external ACP agents.
 *
 * acpx is spawned as a child process rather than imported in-process. The
 * daemon ships as a Node SEA sidecar, and acpx pulls native/optional packages
 * (platform-specific agent bridges, tsx) that cannot be bundled reliably.
 * Running it out-of-process also keeps the external agent in its own OS
 * permission domain.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { getExecutablePath } from "../../process-spawner.js";

export interface AcpxRuntimeLocation {
  /** Executable to spawn. */
  command: string;
  /** Arguments that must precede acpx's own argv. */
  prefixArgs: string[];
  /** Human-readable description used in diagnostics. */
  description: string;
  version?: string;
}

let cached: AcpxRuntimeLocation | null | undefined;

/**
 * Locate acpx.
 *
 * Order matters: the workspace dependency wins so a repo checkout and a
 * globally installed CLI cannot silently disagree about protocol behaviour.
 */
export function locateAcpxRuntime(): AcpxRuntimeLocation | null {
  if (cached !== undefined) return cached;

  const fromDependency = locateFromDependency();
  if (fromDependency) {
    cached = fromDependency;
    return cached;
  }

  const onPath = getExecutablePath("acpx");
  if (onPath) {
    cached = {
      command: onPath,
      prefixArgs: [],
      description: `acpx on PATH (${onPath})`,
    };
    return cached;
  }

  cached = null;
  return cached;
}

function locateFromDependency(): AcpxRuntimeLocation | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("acpx/package.json");
    const packageDir = dirname(packageJsonPath);
    const cliPath = join(packageDir, "dist", "cli.js");
    if (!existsSync(cliPath)) return null;
    return {
      command: process.execPath,
      prefixArgs: [cliPath],
      description: `acpx dependency (${resolve(cliPath)})`,
    };
  } catch {
    return null;
  }
}

/** Clear the cached probe. Exposed for tests. */
export function resetAcpxRuntimeCache(): void {
  cached = undefined;
}
