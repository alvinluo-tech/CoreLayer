/**
 * Verification — objective checks applied to executor artifacts.
 *
 * Verification is NOT self-report. It runs concrete checks and produces
 * structured results that the delivery gate can evaluate.
 *
 * Domain-agnostic: verification checks can be coding-specific (lint, test, build)
 * or generic (path policy, artifact presence, output quality).
 */

/** Result of a single verification check */
export interface VerificationResult {
  /** Check name (e.g., "path-policy", "test-command", "artifact-presence") */
  checkName: string;
  /** Whether the check passed */
  passed: boolean;
  /** Human-readable summary */
  summary: string;
  /** Severity if failed */
  severity: "info" | "warning" | "error" | "critical";
  /** Duration of the check in ms */
  durationMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Aggregate verification report for a run */
export interface VerificationReport {
  runId: string;
  /** Whether all checks passed */
  allPassed: boolean;
  /** Individual check results */
  results: VerificationResult[];
  /** Timestamp */
  verifiedAt: string;
  /** Total duration */
  totalDurationMs: number;
}

/**
 * Verify that changed files are within allowed paths.
 */
export function verifyPathPolicy(
  changedFiles: string[],
  allowedPaths?: string[],
  deniedPaths?: string[],
): VerificationResult {
  const start = Date.now();

  if (!allowedPaths && !deniedPaths) {
    return {
      checkName: "path-policy",
      passed: true,
      summary: "No path policy configured",
      severity: "info",
      durationMs: Date.now() - start,
    };
  }

  const violations: string[] = [];

  for (const file of changedFiles) {
    // Check denied paths
    if (deniedPaths) {
      for (const denied of deniedPaths) {
        if (matchesGlob(file, denied)) {
          violations.push(`${file} matches denied pattern: ${denied}`);
        }
      }
    }

    // Check allowed paths (if specified, file must match at least one)
    if (allowedPaths && allowedPaths.length > 0) {
      const allowed = allowedPaths.some((pattern) => matchesGlob(file, pattern));
      if (!allowed) {
        violations.push(`${file} not in allowed paths`);
      }
    }
  }

  return {
    checkName: "path-policy",
    passed: violations.length === 0,
    summary:
      violations.length === 0
        ? `All ${changedFiles.length} files within policy`
        : `${violations.length} violation(s): ${violations[0]}`,
    severity: violations.length === 0 ? "info" : "error",
    durationMs: Date.now() - start,
    metadata: { violations, changedFiles },
  };
}

/**
 * Verify that required artifacts are present.
 */
export function verifyArtifactPresence(
  artifacts: Array<{ type: string }>,
  requiredTypes: string[],
): VerificationResult {
  const start = Date.now();
  const present = new Set(artifacts.map((a) => a.type));
  const missing = requiredTypes.filter((t) => !present.has(t));

  return {
    checkName: "artifact-presence",
    passed: missing.length === 0,
    summary:
      missing.length === 0
        ? `All ${requiredTypes.length} required artifacts present`
        : `Missing artifacts: ${missing.join(", ")}`,
    severity: missing.length === 0 ? "info" : "warning",
    durationMs: Date.now() - start,
    metadata: { required: requiredTypes, missing, present: [...present] },
  };
}

/**
 * Run a test command and return the verification result.
 */
export async function verifyTestCommand(
  command: string,
  cwd: string,
  timeoutMs = 60_000,
): Promise<VerificationResult> {
  const start = Date.now();

  try {
    const { spawnProcess } = await import("./process-spawner.js");
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    const result = await spawnProcess({
      command: shell,
      args: shellArgs,
      cwd,
      timeoutMs,
    });

    return {
      checkName: "test-command",
      passed: result.exitCode === 0,
      summary:
        result.exitCode === 0
          ? `Tests passed: ${command}`
          : `Tests failed (exit ${result.exitCode}): ${result.stderr.slice(0, 200)}`,
      severity: result.exitCode === 0 ? "info" : "error",
      durationMs: Date.now() - start,
      metadata: {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 1000),
        stderr: result.stderr.slice(0, 1000),
      },
    };
  } catch (err) {
    return {
      checkName: "test-command",
      passed: false,
      summary: `Test command error: ${err instanceof Error ? err.message : String(err)}`,
      severity: "error",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run all verification checks and produce a report.
 */
export async function runVerification(
  runId: string,
  options: {
    changedFiles?: string[];
    artifacts?: Array<{ type: string }>;
    allowedPaths?: string[];
    deniedPaths?: string[];
    requiredArtifactTypes?: string[];
    testCommand?: string;
    testCwd?: string;
  },
): Promise<VerificationReport> {
  const start = Date.now();
  const results: VerificationResult[] = [];

  // Path policy check
  if (options.changedFiles) {
    results.push(
      verifyPathPolicy(options.changedFiles, options.allowedPaths, options.deniedPaths),
    );
  }

  // Artifact presence check
  if (options.artifacts && options.requiredArtifactTypes) {
    results.push(verifyArtifactPresence(options.artifacts, options.requiredArtifactTypes));
  }

  // Test command check
  if (options.testCommand && options.testCwd) {
    results.push(await verifyTestCommand(options.testCommand, options.testCwd));
  }

  return {
    runId,
    allPassed: results.every((r) => r.passed),
    results,
    verifiedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - start,
  };
}

/**
 * Simple glob matching (supports * and **).
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regex = pattern
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLE_STAR\}\}/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${regex}$`).test(path);
}
