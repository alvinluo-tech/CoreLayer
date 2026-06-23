/**
 * Permission Block Handler — converts executor permission blocks into Jarvis states.
 *
 * When an executor (Claude Code, Codex, OpenCode) blocks on a permission request,
 * this handler detects it and converts it into a visible Jarvis approval request
 * or marks the run as blocked.
 */

import type { RiskLevel } from "../../capabilities/permission-grant.js";

/** Known permission block patterns per executor */
const KNOWN_PATTERNS: Record<string, Array<{ pattern: RegExp; risk: RiskLevel; description: string }>> = {
  "claude-code": [
    {
      pattern: /Do you want to proceed\?/i,
      risk: "medium",
      description: "Claude Code asking for confirmation",
    },
    {
      pattern: /Allow.*to.*\?/i,
      risk: "medium",
      description: "Claude Code tool permission request",
    },
    {
      pattern: /Claude needs your permission/i,
      risk: "high",
      description: "Claude Code explicit permission request",
    },
  ],
  codex: [
    {
      pattern: /approve.*action/i,
      risk: "medium",
      description: "Codex action approval request",
    },
  ],
  opencode: [
    {
      pattern: /confirm.*operation/i,
      risk: "medium",
      description: "OpenCode operation confirmation",
    },
  ],
};

export interface PermissionBlockDetection {
  detected: boolean;
  adapterId: string;
  risk: RiskLevel;
  description: string;
  rawOutput: string;
  matchedPattern: string;
}

/**
 * Detect if an executor's output indicates a permission block.
 */
export function detectPermissionBlock(
  adapterId: string,
  output: string,
): PermissionBlockDetection {
  const patterns = KNOWN_PATTERNS[adapterId] ?? [];

  for (const { pattern, risk, description } of patterns) {
    if (pattern.test(output)) {
      return {
        detected: true,
        adapterId,
        risk,
        description,
        rawOutput: output.slice(0, 500),
        matchedPattern: pattern.source,
      };
    }
  }

  // Generic detection: look for interactive prompts
  if (output.includes("?") && (output.includes("[y/N]") || output.includes("[Y/n]") || output.includes("(yes/no)"))) {
    return {
      detected: true,
      adapterId,
      risk: "medium",
      description: "Generic interactive prompt detected",
      rawOutput: output.slice(0, 500),
      matchedPattern: "[y/N]|[Y/n]|(yes/no)",
    };
  }

  return {
    detected: false,
    adapterId,
    risk: "low",
    description: "",
    rawOutput: output.slice(0, 500),
    matchedPattern: "",
  };
}

/**
 * Create an approval request from a permission block detection.
 */
export function createApprovalFromBlock(
  detection: PermissionBlockDetection,
  runId: string,
): {
  runId: string;
  toolName: string;
  risk: RiskLevel;
  preview: string;
  source: string;
} {
  return {
    runId,
    toolName: `${detection.adapterId}:permission`,
    risk: detection.risk,
    preview: detection.description,
    source: detection.adapterId,
  };
}
