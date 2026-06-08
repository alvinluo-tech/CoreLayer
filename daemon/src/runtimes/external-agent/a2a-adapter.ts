/**
 * A2A Network Adapter.
 *
 * Discovers and delegates tasks to network-accessible agents
 * that implement the A2A protocol (AgentCard discovery, task delegation).
 *
 * This is a skeleton — not wired into the runtime yet.
 * Implement after: AgentProfile config, Run/queue system, CodingRuntime.
 */

import type {
  ExternalAgentAdapter,
  AgentCard,
  Task,
  TaskEvent,
} from "./protocol.js";

interface A2AAgentEndpoint {
  id: string;
  name: string;
  url: string;
}

export class A2AAdapter implements ExternalAgentAdapter {
  readonly id = "a2a-network";
  readonly name = "A2A Network Adapter";

  private endpoints: A2AAgentEndpoint[] = [];

  /** Register a known agent endpoint */
  addEndpoint(endpoint: A2AAgentEndpoint): void {
    this.endpoints.push(endpoint);
  }

  /** Remove a registered endpoint */
  removeEndpoint(id: string): void {
    this.endpoints = this.endpoints.filter((e) => e.id !== id);
  }

  async discover(): Promise<AgentCard[]> {
    const cards: AgentCard[] = [];

    for (const endpoint of this.endpoints) {
      try {
        const response = await fetch(`${endpoint.url}/.well-known/agent.json`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) {
          const card = (await response.json()) as AgentCard;
          cards.push(card);
        }
      } catch {
        // Agent unreachable — skip silently
      }
    }

    return cards;
  }

  async getAgent(agentId: string): Promise<AgentCard | null> {
    const endpoint = this.endpoints.find((e) => e.id === agentId);
    if (!endpoint) return null;

    try {
      const response = await fetch(`${endpoint.url}/.well-known/agent.json`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        return (await response.json()) as AgentCard;
      }
    } catch {
      // Agent unreachable
    }

    return null;
  }

  async delegate(task: {
    agentId: string;
    description: string;
    input?: string;
    context?: Record<string, unknown>;
  }): Promise<Task> {
    const endpoint = this.endpoints.find((e) => e.id === task.agentId);
    if (!endpoint) {
      throw new Error(`Agent not found: ${task.agentId}`);
    }

    const now = new Date().toISOString();
    const taskId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const response = await fetch(`${endpoint.url}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: taskId,
          description: task.description,
          input: task.input,
          context: task.context,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Delegation failed (${response.status})`);
      }

      const result = (await response.json()) as Task;
      return result;
    } catch (error) {
      return {
        id: taskId,
        agentId: task.agentId,
        description: task.description,
        status: "failed",
        messages: [],
        artifacts: [],
        error: error instanceof Error ? error.message : String(error),
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<Task> {
    // Find the endpoint that owns this task (by convention: first endpoint)
    for (const endpoint of this.endpoints) {
      try {
        const response = await fetch(`${endpoint.url}/tasks/${taskId}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) {
          return (await response.json()) as Task;
        }
      } catch {
        // Continue to next endpoint
      }
    }

    throw new Error(`Task not found: ${taskId}`);
  }

  async cancelTask(taskId: string): Promise<boolean> {
    for (const endpoint of this.endpoints) {
      try {
        const response = await fetch(`${endpoint.url}/tasks/${taskId}/cancel`, {
          method: "POST",
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) return true;
      } catch {
        // Continue to next endpoint
      }
    }

    return false;
  }

  async *streamTaskEvents(_taskId: string): AsyncIterable<TaskEvent> {
    // Skeleton: streaming not implemented yet
    // Future: SSE or WebSocket connection to agent endpoint
    yield* [];
  }
}

/**
 * Create an A2A adapter with pre-configured endpoints.
 * For use when AgentProfile specifies external agent delegation.
 */
export function createA2AAdapter(endpoints: A2AAgentEndpoint[]): A2AAdapter {
  const adapter = new A2AAdapter();
  for (const ep of endpoints) {
    adapter.addEndpoint(ep);
  }
  return adapter;
}
