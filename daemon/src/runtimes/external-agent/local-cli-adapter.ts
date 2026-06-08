/**
 * Local CLI Adapter.
 *
 * Wraps local command-line agents (Codex CLI, Claude Code, OpenCode)
 * as ExternalAgentAdapter-compatible instances.
 *
 * This is a skeleton — subprocess execution is handled by
 * daemon/src/runtimes/coding/. This adapter provides the discovery
 * and delegation surface for the A2A protocol layer.
 *
 * Implement after: CodingRuntime subprocess execution is stable.
 */

import type {
  ExternalAgentAdapter,
  AgentCard,
  Task,
  TaskEvent,
} from "./protocol.js";
import { A2A_PROTOCOL_VERSION } from "./protocol.js";

interface CLIAgentDefinition {
  id: string;
  name: string;
  command: string;
  args?: string[];
  /** Working directory override */
  cwd?: string;
}

const KNOWN_CLI_AGENTS: CLIAgentDefinition[] = [
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    command: "codex",
    args: ["--quiet", "--full-auto"],
  },
  {
    id: "claude-code",
    name: "Claude Code CLI",
    command: "claude",
    args: ["--dangerously-skip-permissions"],
  },
  {
    id: "opencode",
    name: "OpenCode CLI",
    command: "opencode",
  },
];

export class LocalCLIAdapter implements ExternalAgentAdapter {
  readonly id = "local-cli";
  readonly name = "Local CLI Adapter";

  private agents: CLIAgentDefinition[];

  constructor(agents?: CLIAgentDefinition[]) {
    this.agents = agents ?? KNOWN_CLI_AGENTS;
  }

  async discover(): Promise<AgentCard[]> {
    const cards: AgentCard[] = [];

    for (const agent of this.agents) {
      const available = await this.isCommandAvailable(agent.command);
      cards.push({
        id: agent.id,
        name: agent.name,
        description: `Local CLI agent: ${agent.command}`,
        capabilities: [
          { id: "coding", name: "Code generation and editing" },
          { id: "research", name: "Codebase research" },
        ],
        inputTypes: ["text/plain"],
        outputTypes: ["text/plain"],
        requiresAuth: false,
        protocolVersion: A2A_PROTOCOL_VERSION,
        // Include availability in metadata
        ...({ available } as Record<string, unknown>),
      });
    }

    return cards;
  }

  async getAgent(agentId: string): Promise<AgentCard | null> {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      name: agent.name,
      description: `Local CLI agent: ${agent.command}`,
      capabilities: [
        { id: "coding", name: "Code generation and editing" },
      ],
      inputTypes: ["text/plain"],
      outputTypes: ["text/plain"],
      requiresAuth: false,
      protocolVersion: A2A_PROTOCOL_VERSION,
    };
  }

  async delegate(task: {
    agentId: string;
    description: string;
    input?: string;
    context?: Record<string, unknown>;
  }): Promise<Task> {
    const agent = this.agents.find((a) => a.id === task.agentId);
    if (!agent) {
      throw new Error(`CLI agent not found: ${task.agentId}`);
    }

    const now = new Date().toISOString();
    const taskId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Skeleton: actual subprocess execution handled by coding-runtime
    // This returns a pending task that coding-runtime would pick up
    return {
      id: taskId,
      agentId: task.agentId,
      description: task.description,
      status: "pending",
      messages: task.input
        ? [{ id: `msg-${Date.now()}`, role: "user", content: task.input, timestamp: now }]
        : [],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async getTaskStatus(taskId: string): Promise<Task> {
    // Skeleton: task tracking handled by coding-runtime
    throw new Error(`Task status not available for: ${taskId}`);
  }

  async cancelTask(_taskId: string): Promise<boolean> {
    // Skeleton: cancellation handled by coding-runtime
    return false;
  }

  async *streamTaskEvents(_taskId: string): AsyncIterable<TaskEvent> {
    // Skeleton: event streaming handled by coding-runtime
    yield* [];
  }

  /** Check if a command is available on the system PATH */
  private async isCommandAvailable(command: string): Promise<boolean> {
    try {
      const { execFileSync } = await import("child_process");
      const platform = process.platform;
      const cmd = platform === "win32" ? "where" : "which";
      execFileSync(cmd, [command], { stdio: "ignore", timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a local CLI adapter with default agents.
 */
export function createLocalCLIAdapter(): LocalCLIAdapter {
  return new LocalCLIAdapter();
}
