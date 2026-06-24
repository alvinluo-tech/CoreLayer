/**
 * Trajectory Service — bundles execution data for debug/audit export.
 *
 * A trajectory bundle contains: events, logs, approvals, artifacts,
 * executor metadata, and verification results. Secrets are redacted.
 */

import { getRepositories } from "../persistence/factory.js";

/** Secret redaction patterns */
const SECRET_PATTERNS = [
  /OPENAI_API_KEY[=:]\s*\S+/gi,
  /ANTHROPIC_API_KEY[=:]\s*\S+/gi,
  /GITHUB_TOKEN[=:]\s*\S+/gi,
  /_TOKEN[=:]\s*\S+/gi,
  /_SECRET[=:]\s*\S+/gi,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
  /Authorization:\s*Bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
];

export interface TrajectoryBundle {
  runId: string;
  generatedAt: string;
  events: unknown[];
  logs: unknown[];
  approvals: unknown[];
  artifacts: unknown[];
  executorRuns: unknown[];
  redactions: { count: number };
}

/**
 * Generate a trajectory bundle for a run.
 */
export async function generateTrajectory(runId: string): Promise<TrajectoryBundle> {
  const repos = getRepositories();
  let redactionCount = 0;

  // Gather data
  const events = await repos.agentRunEvents.getByRunId(runId).catch(() => []);
  const logs = await repos.executionLogs.getByRunId(runId).catch(() => []);
  const approvals = await repos.approvalRequests.getByRunId?.(runId).catch(() => []) ?? [];
  const executorRuns = await repos.executorRuns.getByAgentRun(runId).catch(() => []);

  // Artifacts are gathered separately per workspace
  const artifacts: unknown[] = [];

  // Redact secrets from all text content
  const redact = (obj: unknown): unknown => {
    if (typeof obj === "string") {
      let result = obj;
      for (const pattern of SECRET_PATTERNS) {
        const matches = result.match(pattern);
        if (matches) redactionCount += matches.length;
        result = result.replace(pattern, "[REDACTED]");
      }
      return result;
    }
    if (Array.isArray(obj)) return obj.map(redact);
    if (obj && typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, redact(v)]),
      );
    }
    return obj;
  };

  return {
    runId,
    generatedAt: new Date().toISOString(),
    events: redact(events) as unknown[],
    logs: redact(logs) as unknown[],
    approvals: redact(approvals) as unknown[],
    artifacts: redact(artifacts) as unknown[],
    executorRuns: redact(executorRuns) as unknown[],
    redactions: { count: redactionCount },
  };
}
