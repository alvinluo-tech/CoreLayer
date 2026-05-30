import type {
  SkillStep,
  SkillExecutionResult,
  StepResult,
} from "./types.js";
import { getSkill } from "./loader.js";
import { getJarvisTool } from "../tools/registry.js";

/**
 * Execute a skill by name with optional input parameters.
 */
export async function executeSkill(
  skillName: string,
  input: Record<string, unknown> = {},
): Promise<SkillExecutionResult> {
  const loaded = getSkill(skillName);
  if (!loaded) {
    return {
      success: false,
      skillName,
      steps: [],
      output: null,
      durationMs: 0,
      error: `Skill not found: ${skillName}`,
    };
  }

  const startTime = Date.now();
  const steps: StepResult[] = [];
  const context: Record<string, unknown> = { input };

  try {
    for (const step of loaded.manifest.steps) {
      const stepResult = await executeStep(step, context);
      steps.push(stepResult);
      context[step.id] = stepResult.output;

      if (!stepResult.success && step.type === "tool_call") {
        return {
          success: false,
          skillName,
          steps,
          output: null,
          durationMs: Date.now() - startTime,
          error: `Step ${step.id} failed: ${stepResult.error}`,
        };
      }
    }

    const lastStep = steps[steps.length - 1];
    return {
      success: true,
      skillName,
      steps,
      output: lastStep?.output ?? null,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      skillName,
      steps,
      output: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute a single skill step.
 */
async function executeStep(
  step: SkillStep,
  context: Record<string, unknown>,
): Promise<StepResult> {
  const startTime = Date.now();

  switch (step.type) {
    case "tool_call":
      return executeToolStep(step, context, startTime);
    case "condition":
      return executeConditionStep(step, context, startTime);
    case "transform":
      return executeTransformStep(step, context, startTime);
    case "output":
      return executeOutputStep(step, context, startTime);
    default:
      return {
        stepId: step.id,
        type: step.type,
        success: false,
        output: null,
        durationMs: Date.now() - startTime,
        error: `Unknown step type: ${step.type}`,
      };
  }
}

async function executeToolStep(
  step: SkillStep,
  context: Record<string, unknown>,
  startTime: number,
): Promise<StepResult> {
  if (!step.tool) {
    return {
      stepId: step.id,
      type: "tool_call",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: "No tool specified for tool_call step",
    };
  }

  const tool = getJarvisTool(step.tool);
  if (!tool) {
    return {
      stepId: step.id,
      type: "tool_call",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: `Tool not found: ${step.tool}`,
    };
  }

  try {
    const args = resolveTemplate(step.args ?? {}, context);
    const result = await tool.execute(args);
    return {
      stepId: step.id,
      type: "tool_call",
      success: result.success,
      output: result.data ?? result.error,
      durationMs: Date.now() - startTime,
      error: result.success ? undefined : String(result.error),
    };
  } catch (err) {
    return {
      stepId: step.id,
      type: "tool_call",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeConditionStep(
  step: SkillStep,
  context: Record<string, unknown>,
  startTime: number,
): StepResult {
  try {
    const result = evaluateExpression(step.condition ?? "false", context);
    return {
      stepId: step.id,
      type: "condition",
      success: true,
      output: { condition: result, next: result ? step.then : step.else },
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      stepId: step.id,
      type: "condition",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeTransformStep(
  step: SkillStep,
  context: Record<string, unknown>,
  startTime: number,
): StepResult {
  try {
    const result = evaluateExpression(step.transform ?? "null", context);
    return {
      stepId: step.id,
      type: "transform",
      success: true,
      output: result,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      stepId: step.id,
      type: "transform",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeOutputStep(
  step: SkillStep,
  context: Record<string, unknown>,
  startTime: number,
): StepResult {
  try {
    const output = resolveTemplateString(step.template ?? "", context);
    return {
      stepId: step.id,
      type: "output",
      success: true,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      stepId: step.id,
      type: "output",
      success: false,
      output: null,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve {{path}} placeholders in a template object.
 */
function resolveTemplate(
  obj: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      resolved[key] = resolveTemplateString(value, context);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Resolve {{path}} placeholders in a string.
 */
function resolveTemplateString(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = resolvePath(path.trim(), context);
    return typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  });
}

/**
 * Resolve a dotted path like "input.title" or "step1.result" against context.
 */
function resolvePath(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    if (part === "__proto__" || part === "constructor" || part === "prototype") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Simple expression evaluator for conditions.
 * Supports: truthy checks, comparisons against context values.
 */
function evaluateExpression(
  expr: string,
  context: Record<string, unknown>,
): boolean {
  const trimmed = expr.trim();

  // Reject expressions containing potentially dangerous patterns
  if (/[();{}[\]]/.test(trimmed) || /\b(eval|Function|require|import|exec)\b/.test(trimmed)) {
    return false;
  }

  // "truthy" — check if a path resolves to a truthy value
  if (!trimmed.includes(" ")) {
    const value = resolvePath(trimmed, context);
    return Boolean(value);
  }

  // Simple comparisons: "input.count > 0", "step1.result == true"
  const match = trimmed.match(/^(\S+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
  if (!match) return Boolean(resolvePath(trimmed, context));

  const [, leftPath, op, rightRaw] = match;
  const left = resolvePath(leftPath!, context);
  const right = isNaN(Number(rightRaw)) ? rightRaw?.trim() : Number(rightRaw);

  switch (op) {
    case "==": return left == right;
    case "!=": return left != right;
    case ">": return Number(left) > Number(right);
    case "<": return Number(left) < Number(right);
    case ">=": return Number(left) >= Number(right);
    case "<=": return Number(left) <= Number(right);
    default: return Boolean(left);
  }
}
