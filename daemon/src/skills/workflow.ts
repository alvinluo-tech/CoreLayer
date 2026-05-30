import { executeSkill } from "./executor.js";
import { getSkill } from "./loader.js";
import type { SkillExecutionResult } from "./types.js";

/**
 * Execute a multi-skill workflow — chains multiple skills sequentially,
 * passing output from one as input to the next.
 */

export interface WorkflowStep {
  /** Skill to execute */
  skill: string;
  /** Static input overrides */
  input?: Record<string, unknown>;
  /** Map previous step outputs to this step's input */
  mapInput?: Record<string, string>;
}

export interface WorkflowDefinition {
  /** Workflow name */
  name: string;
  /** Description */
  description: string;
  /** Sequential steps */
  steps: WorkflowStep[];
}

export interface WorkflowResult {
  success: boolean;
  workflowName: string;
  stepResults: SkillExecutionResult[];
  finalOutput: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Execute a workflow definition.
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  initialInput: Record<string, unknown> = {},
): Promise<WorkflowResult> {
  const startTime = Date.now();
  const stepResults: SkillExecutionResult[] = [];
  let currentInput = { ...initialInput };

  try {
    for (const step of workflow.steps) {
      // Apply input mapping from previous steps
      if (step.mapInput) {
        for (const [targetKey, sourcePath] of Object.entries(step.mapInput)) {
          currentInput[targetKey] = resolvePath(sourcePath, {
            input: currentInput,
            ...Object.fromEntries(
              stepResults.map((r, i) => [`step${i + 1}`, r.output]),
            ),
          });
        }
      }

      // Merge static input overrides
      if (step.input) {
        currentInput = { ...currentInput, ...step.input };
      }

      const result = await executeSkill(step.skill, currentInput);
      stepResults.push(result);

      if (!result.success) {
        return {
          success: false,
          workflowName: workflow.name,
          stepResults,
          finalOutput: null,
          durationMs: Date.now() - startTime,
          error: `Step "${step.skill}" failed: ${result.error}`,
        };
      }

      // Pass output as input to next step
      currentInput = { result: result.output };
    }

    const lastResult = stepResults[stepResults.length - 1];
    return {
      success: true,
      workflowName: workflow.name,
      stepResults,
      finalOutput: lastResult?.output ?? null,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      workflowName: workflow.name,
      stepResults,
      finalOutput: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validate that all skills referenced in a workflow exist.
 */
export function validateWorkflow(workflow: WorkflowDefinition): string[] {
  const errors: string[] = [];
  for (const step of workflow.steps) {
    if (!getSkill(step.skill)) {
      errors.push(`Skill not found: ${step.skill}`);
    }
  }
  return errors;
}

function resolvePath(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
