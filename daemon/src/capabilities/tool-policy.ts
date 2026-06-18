/**
 * Tool Policy Modes — additional policies for controlling tool access.
 *
 * Inspired by Odysseus's ToolPolicy. Extends the existing permission system
 * with two new modes:
 *
 * - "guide_only": Tools can execute, but the agent is guided to prefer
 *   safer alternatives. Read-only tools are unrestricted; write tools
 *   trigger a guidance message suggesting alternatives.
 *
 * - "disable_all": All tools are disabled. The agent can only respond
 *   with text. Useful for safety-critical conversations or when the user
 *   wants a pure chat experience.
 *
 * These policies are applied ON TOP of the existing permission guard,
 * not as a replacement.
 */

import type { JarvisTool } from "@jarvis/types";

export type ToolPolicyMode = "standard" | "guide_only" | "disable_all";

export interface ToolPolicyResult {
  allowed: boolean;
  guidance?: string;
}

/**
 * Check if a tool call is allowed under the given policy mode.
 */
export function checkToolPolicy(
  tool: JarvisTool,
  mode: ToolPolicyMode,
): ToolPolicyResult {
  switch (mode) {
    case "disable_all":
      return {
        allowed: false,
        guidance: `工具 "${tool.name}" 在当前模式下不可用。请用文字回复用户。`,
      };

    case "guide_only": {
      // Read-only tools are always allowed
      if (isReadOnlyTool(tool)) {
        return { allowed: true };
      }
      // Write/execute tools: allow but add guidance
      return {
        allowed: true,
        guidance: getGuidance(tool),
      };
    }

    case "standard":
    default:
      return { allowed: true };
  }
}

/**
 * Check if the tool is read-only (no side effects).
 */
function isReadOnlyTool(tool: JarvisTool): boolean {
  const readOnlyActions = new Set(["read", "search", "query", "list", "get"]);
  const readOnlyTools = new Set([
    "bash", "readFile", "glob", "grep", "listFiles",
    "webSearch", "webFetch", "searchMemory", "getMemory",
  ]);

  if (readOnlyTools.has(tool.name)) return true;
  const action = (tool as { action?: string }).action;
  if (action && readOnlyActions.has(action)) return true;

  // Check risk level: low risk is likely read-only
  if (tool.risk === "low") return true;

  return false;
}

/**
 * Get guidance text for a tool that requires user confirmation.
 */
function getGuidance(tool: JarvisTool): string {
  return `⚠️ 工具 "${tool.name}" 将会执行写入操作。建议先向用户确认是否继续。`;
}

/**
 * Get the tool policy mode from a string value.
 */
export function parseToolPolicyMode(value?: string): ToolPolicyMode {
  if (value === "guide_only" || value === "disable_all") return value;
  return "standard";
}
