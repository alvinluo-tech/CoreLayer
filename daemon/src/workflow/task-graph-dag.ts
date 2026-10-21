/**
 * Task Graph DAG — pure topological planning and bounds validation for multi-agent graphs.
 *
 * This module takes a declarative graph of tasks with dependencies and computes
 * an execution plan divided into parallel waves (batches). It enforces two core
 * safety properties:
 *
 * 1. **Acyclic and Complete**: The graph must be non-empty, strictly acyclic
 *    (topologically sortable), free of duplicate node IDs, and self-contained
 *    (every dependency points to an existing node in the graph).
 * 2. **Monotonically Bounded**: Every node's requested permissions are narrowed
 *    against what the parent run actually holds via `narrowDelegationBounds`. A node
 *    cannot widen permissions, bypass parent test commands, or escalate timeouts.
 */

import {
  narrowDelegationBounds,
  validateDelegationRequest,
  type DelegationBounds,
  type DelegationRequest,
  MAX_DELEGATION_PROMPT_CHARS,
  MAX_DELEGATION_TIMEOUT_MS,
  MIN_DELEGATION_TIMEOUT_MS,
} from "./delegation-bounds.js";

export const MAX_GRAPH_NODES = 16;
export const DEFAULT_GRAPH_TIMEOUT_MS = 30 * 60_000;

export interface TaskGraphNodeInput extends DelegationRequest {
  /** Unique identifier for the node within this graph. */
  id: string;
  /** IDs of predecessor nodes that must succeed before this node starts. */
  dependencies?: string[];
}

export interface TaskGraphInput {
  /** Nodes that form the task graph. */
  nodes: TaskGraphNodeInput[];
  /** Stop remaining branches if any node fails. Default true. */
  failFast?: boolean;
  /** Overall graph timeout ceiling. Clamped to [MIN_DELEGATION_TIMEOUT_MS, MAX_DELEGATION_TIMEOUT_MS]. */
  totalTimeoutMs?: number;
}

export class TaskGraphRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskGraphRejected";
  }
}

export interface TaskGraphPlanNode {
  id: string;
  task: string;
  dependencies: string[];
  dependents: string[];
  bounds: DelegationBounds;
}

export interface TaskGraphExecutionPlan {
  /** Map of node ID to resolved plan node. */
  nodes: Record<string, TaskGraphPlanNode>;
  /**
   * Execution waves where each wave contains node IDs that can run concurrently.
   * Wave 0 contains nodes with no dependencies.
   * Wave N contains nodes whose dependencies are all in waves 0..(N-1).
   */
  waves: string[][];
  failFast: boolean;
  totalTimeoutMs: number;
  /** Potential file conflicts detected between parallel nodes within the same wave. */
  parallelPathWarnings: Array<{ waveIndex: number; nodeA: string; nodeB: string; path: string }>;
}

const NODE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates a declarative task graph and plans its parallel execution waves.
 *
 * Throws `TaskGraphRejected` or `DelegationRejected` if the graph is invalid, cyclic,
 * or attempts to exceed parent bounds.
 */
export function planTaskGraph(
  input: TaskGraphInput,
  parentBounds: DelegationBounds,
): TaskGraphExecutionPlan {
  if (!input || !Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new TaskGraphRejected("Task graph must contain at least 1 node");
  }

  if (input.nodes.length > MAX_GRAPH_NODES) {
    throw new TaskGraphRejected(
      `Task graph exceeds maximum allowed nodes (${input.nodes.length} > ${MAX_GRAPH_NODES})`,
    );
  }

  const nodeMap = new Map<string, TaskGraphNodeInput>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // node -> dependents
  const dependenciesMap = new Map<string, string[]>();

  // 1. Validate node identity and register maps
  for (const node of input.nodes) {
    if (!node || typeof node.id !== "string" || !NODE_ID_RE.test(node.id)) {
      throw new TaskGraphRejected(
        `Invalid node id: ${JSON.stringify(node?.id)}. Must match ${NODE_ID_RE}`,
      );
    }
    if (nodeMap.has(node.id)) {
      throw new TaskGraphRejected(`Duplicate node id: "${node.id}"`);
    }
    if (!node.task || typeof node.task !== "string" || node.task.trim().length === 0) {
      throw new TaskGraphRejected(`Node "${node.id}" task prompt cannot be empty`);
    }
    if (node.task.length > MAX_DELEGATION_PROMPT_CHARS) {
      throw new TaskGraphRejected(
        `Node "${node.id}" task prompt exceeds ${MAX_DELEGATION_PROMPT_CHARS} characters`,
      );
    }

    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
    dependenciesMap.set(node.id, []);
  }

  // 2. Validate dependencies & build graph edges
  for (const node of input.nodes) {
    const rawDeps = node.dependencies ?? [];
    if (!Array.isArray(rawDeps)) {
      throw new TaskGraphRejected(`Node "${node.id}" dependencies must be an array of strings`);
    }

    const uniqueDeps = Array.from(new Set(rawDeps));
    for (const depId of uniqueDeps) {
      if (depId === node.id) {
        throw new TaskGraphRejected(`Node "${node.id}" cannot depend on itself (self-cycle)`);
      }
      if (!nodeMap.has(depId)) {
        throw new TaskGraphRejected(
          `Node "${node.id}" depends on unknown node "${depId}"`,
        );
      }
      adjacency.get(depId)!.push(node.id);
    }

    dependenciesMap.set(node.id, uniqueDeps);
    inDegree.set(node.id, uniqueDeps.length);
  }

  // 3. Topological sorting & wave computation (Kahn's Algorithm)
  const waves: string[][] = [];
  const currentInDegrees = new Map(inDegree);
  let resolvedCount = 0;

  // Initial wave: nodes with in-degree == 0
  let currentWave: string[] = [];
  for (const [id, deg] of currentInDegrees.entries()) {
    if (deg === 0) {
      currentWave.push(id);
    }
  }

  if (currentWave.length === 0) {
    throw new TaskGraphRejected("Circular dependency detected: no initial node with 0 dependencies");
  }

  while (currentWave.length > 0) {
    // Sort wave deterministically by node id
    currentWave.sort();
    waves.push(currentWave);
    resolvedCount += currentWave.length;

    const nextWave: string[] = [];
    for (const nodeId of currentWave) {
      const dependents = adjacency.get(nodeId) || [];
      for (const dependentId of dependents) {
        const remaining = (currentInDegrees.get(dependentId) ?? 1) - 1;
        currentInDegrees.set(dependentId, remaining);
        if (remaining === 0) {
          nextWave.push(dependentId);
        }
      }
    }

    currentWave = nextWave;
  }

  if (resolvedCount !== input.nodes.length) {
    const unvisited = Array.from(nodeMap.keys()).filter(
      (id) => (currentInDegrees.get(id) ?? 0) > 0,
    );
    throw new TaskGraphRejected(
      `Circular dependency detected involving nodes: ${unvisited.sort().join(", ")}`,
    );
  }

  // 4. Validate and narrow delegation bounds for each node
  const resolvedNodes: Record<string, TaskGraphPlanNode> = {};
  for (const node of input.nodes) {
    validateDelegationRequest(node, parentBounds);
    const bounds = narrowDelegationBounds(parentBounds, node);
    resolvedNodes[node.id] = {
      id: node.id,
      task: node.task,
      dependencies: dependenciesMap.get(node.id) ?? [],
      dependents: adjacency.get(node.id) ?? [],
      bounds,
    };
  }

  // 5. Parallel path collision pre-check within each wave
  const parallelPathWarnings: TaskGraphExecutionPlan["parallelPathWarnings"] = [];
  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w];
    if (wave.length <= 1) continue;

    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) {
        const nodeA = resolvedNodes[wave[i]];
        const nodeB = resolvedNodes[wave[j]];
        const collision = findPathCollision(nodeA.bounds.allowedPaths, nodeB.bounds.allowedPaths);
        if (collision) {
          parallelPathWarnings.push({
            waveIndex: w,
            nodeA: nodeA.id,
            nodeB: nodeB.id,
            path: collision,
          });
        }
      }
    }
  }

  const totalTimeout = Math.max(
    MIN_DELEGATION_TIMEOUT_MS,
    Math.min(
      input.totalTimeoutMs ?? DEFAULT_GRAPH_TIMEOUT_MS,
      parentBounds.timeoutMs,
      MAX_DELEGATION_TIMEOUT_MS,
    ),
  );

  return {
    nodes: resolvedNodes,
    waves,
    failFast: input.failFast !== false,
    totalTimeoutMs: totalTimeout,
    parallelPathWarnings,
  };
}

/**
 * Checks if two sets of allowed paths have an overlapping write scope.
 * If either allows everything (empty list), returns a warning.
 */
function findPathCollision(pathsA: string[], pathsB: string[]): string | null {
  if (pathsA.length === 0 && pathsB.length === 0) {
    return "* (both nodes have unrestricted path access)";
  }
  if (pathsA.length === 0) return "* (node A has unrestricted path access)";
  if (pathsB.length === 0) return "* (node B has unrestricted path access)";

  for (const a of pathsA) {
    for (const b of pathsB) {
      if (a === b) return a;
      // Prefix overlaps: e.g. "src/**" and "src/parser/**"
      const normA = a.replace(/\/\*\*?$/, "");
      const normB = b.replace(/\/\*\*?$/, "");
      if (normA.startsWith(normB) || normB.startsWith(normA)) {
        return `${a} ~ ${b}`;
      }
    }
  }
  return null;
}
