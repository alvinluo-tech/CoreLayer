/**
 * Quality Gate Registry — task-type-specific verification gates.
 *
 * Each task type (coding, research, image, messaging) has its own
 * set of quality gates that must pass before delivery.
 */

import type { VerificationResult } from "./verification.js";

/** Quality gate definition */
export interface QualityGate {
  /** Gate name */
  name: string;
  /** Task types this gate applies to */
  taskTypes: string[];
  /** Whether this gate is required (blocks delivery) or advisory */
  required: boolean;
  /** Run the gate check */
  check(context: GateContext): Promise<VerificationResult>;
}

/** Context passed to gate checks */
export interface GateContext {
  runId: string;
  taskType: string;
  workingDirectory: string;
  changedFiles: string[];
  artifacts: Array<{ type: string; content: string }>;
  metadata?: Record<string, unknown>;
}

/** Quality gate registry */
const gates = new Map<string, QualityGate>();

/**
 * Register a quality gate.
 */
export function registerGate(gate: QualityGate): void {
  gates.set(gate.name, gate);
}

/**
 * Get all gates for a task type.
 */
export function getGatesForTaskType(taskType: string): QualityGate[] {
  return [...gates.values()].filter((g) => g.taskTypes.includes(taskType) || g.taskTypes.includes("*"));
}

/**
 * Run all quality gates for a task type.
 */
export async function runQualityGates(context: GateContext): Promise<VerificationResult[]> {
  const applicableGates = getGatesForTaskType(context.taskType);
  const results: VerificationResult[] = [];

  for (const gate of applicableGates) {
    try {
      const result = await gate.check(context);
      results.push(result);
    } catch (err) {
      results.push({
        checkName: gate.name,
        passed: false,
        summary: `Gate error: ${err instanceof Error ? err.message : String(err)}`,
        severity: "error",
      });
    }
  }

  return results;
}

/**
 * Check if all required gates pass.
 */
export function allRequiredGatesPass(results: VerificationResult[], taskType: string): boolean {
  const applicableGates = getGatesForTaskType(taskType);
  const requiredGateNames = new Set(applicableGates.filter((g) => g.required).map((g) => g.name));

  return results
    .filter((r) => requiredGateNames.has(r.checkName))
    .every((r) => r.passed);
}

/** Reset gates (for testing) */
export function resetGates(): void {
  gates.clear();
}
