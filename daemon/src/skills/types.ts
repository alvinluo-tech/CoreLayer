/**
 * Skill manifest format — defines a reusable multi-step workflow.
 */

export interface SkillManifest {
  /** Unique skill identifier */
  name: string;
  /** Human-readable display name */
  title: string;
  /** What this skill does */
  description: string;
  /** Version string (semver) */
  version: string;
  /** Trigger phrases that activate this skill */
  triggers: string[];
  /** Tools this skill uses (tool names from ToolRegistry) */
  toolsUsed: string[];
  /** Risk level for the entire skill */
  risk: "low" | "medium" | "high" | "critical";
  /** Execution steps */
  steps: SkillStep[];
  /** Optional input schema for skill parameters */
  inputSchema?: Record<string, unknown>;
}

export interface SkillStep {
  /** Step identifier */
  id: string;
  /** Step type */
  type: "tool_call" | "condition" | "transform" | "output";
  /** Tool to call (for tool_call type) */
  tool?: string;
  /** Arguments template — supports {{input.field}} and {{stepId.result}} placeholders */
  args?: Record<string, unknown>;
  /** Condition expression (for condition type) */
  condition?: string;
  /** Next step based on condition result */
  then?: string;
  else?: string;
  /** Transform expression (for transform type) */
  transform?: string;
  /** Output template (for output type) */
  template?: string;
}

export interface SkillExecutionResult {
  success: boolean;
  skillName: string;
  steps: StepResult[];
  output: unknown;
  durationMs: number;
  error?: string;
}

export interface StepResult {
  stepId: string;
  type: string;
  success: boolean;
  output: unknown;
  durationMs: number;
  error?: string;
}

export interface LoadedSkill {
  manifest: SkillManifest;
  filePath: string;
  loadedAt: string;
}
