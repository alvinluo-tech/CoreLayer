/**
 * AgentSpec and TeamSpec — make agents measurable capability units.
 *
 * AgentSpec defines what an agent can do.
 * TeamSpec defines how agents work together.
 */

/** Agent role in a team */
export type AgentRole = "planner" | "builder" | "reviewer" | "tester" | "researcher" | "observer";

/** Agent specification */
export interface AgentSpec {
  /** Unique agent ID */
  id: string;
  /** Semantic version */
  version: string;
  /** Agent role */
  role: AgentRole;
  /** Human-readable description */
  description: string;
  /** Skills this agent has */
  skills: string[];
  /** Tools this agent can use */
  tools: string[];
  /** Preferred executors */
  executorPreference: string[];
  /** Model policy */
  modelPolicy: {
    preferredModels: string[];
    fallbackModel?: string;
  };
  /** Default permission mode */
  permissionMode: "strict" | "normal" | "permissive";
  /** Quality gates this agent requires */
  qualityGates: string[];
  /** Limits on what this agent can do */
  limits: string[];
}

/** Team specification */
export interface TeamSpec {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Agent assignments */
  agents: Array<{
    agentId: string;
    role: AgentRole;
    /** Task types this agent handles */
    taskTypes: string[];
  }>;
  /** Workflow definition */
  workflow: {
    /** Whether reviewer is required after builder */
    requireReview: boolean;
    /** Whether tests are required */
    requireTests: boolean;
    /** Maximum retry attempts per task */
    maxRetries: number;
  };
}

/** Agent performance tracking */
export interface AgentPerformance {
  agentId: string;
  taskType: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  verificationFailureCount: number;
  averageDurationMs: number;
  lastUpdated: string;
}

/**
 * Calculate success rate for an agent.
 */
export function calculateSuccessRate(perf: AgentPerformance): number {
  if (perf.totalRuns === 0) return 0;
  return perf.successCount / perf.totalRuns;
}

/**
 * Select the best agent for a task type based on performance.
 */
export function selectBestAgent(
  candidates: AgentSpec[],
  taskType: string,
  performances: Map<string, AgentPerformance>,
): AgentSpec | null {
  if (candidates.length === 0) return null;

  // Score each candidate
  const scored = candidates.map((spec) => {
    const perf = performances.get(spec.id);
    const successRate = perf ? calculateSuccessRate(perf) : 0.5; // default 50%
    const hasSkill = spec.skills.includes(taskType) ? 1 : 0;
    const score = successRate * 0.7 + hasSkill * 0.3;
    return { spec, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].spec;
}
