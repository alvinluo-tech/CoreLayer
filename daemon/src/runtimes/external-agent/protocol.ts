/**
 * A2A (Agent-to-Agent) Protocol Definition.
 *
 * Thin compatibility boundary for external agent interoperability.
 * This is a skeleton — not wired into the critical path yet.
 *
 * Implements the A2A spec concepts:
 * - AgentCard: capability discovery
 * - Task: delegated work unit
 * - Message: communication between agents
 * - Artifact: output produced by a task
 */

// ---- Agent Identity & Discovery ----

export interface AgentCapability {
  id: string;
  name: string;
  description?: string;
}

export interface AgentCard {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent description */
  description?: string;
  /** URL endpoint for the agent (if network-accessible) */
  url?: string;
  /** Capabilities this agent supports */
  capabilities: AgentCapability[];
  /** Supported input MIME types */
  inputTypes: string[];
  /** Supported output MIME types */
  outputTypes: string[];
  /** Whether this agent requires authentication */
  requiresAuth: boolean;
  /** Protocol version */
  protocolVersion: string;
}

// ---- Task Delegation ----

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "waiting_for_approval";

export interface TaskMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

export interface TaskArtifact {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  /** The agent this task is delegated to */
  agentId: string;
  /** Human-readable task description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** Messages exchanged during task execution */
  messages: TaskMessage[];
  /** Artifacts produced by the task */
  artifacts: TaskArtifact[];
  /** Error message if failed */
  error?: string;
  /** When the task was created */
  createdAt: string;
  /** When the task was last updated */
  updatedAt: string;
  /** When the task completed (if done) */
  completedAt?: string;
}

// ---- External Agent Adapter Contract ----

export interface ExternalAgentAdapter {
  /** Unique adapter identifier */
  readonly id: string;
  /** Human-readable adapter name */
  readonly name: string;

  /** Discover available agents */
  discover(): Promise<AgentCard[]>;

  /** Get agent card by id */
  getAgent(agentId: string): Promise<AgentCard | null>;

  /** Delegate a task to an external agent */
  delegate(task: {
    agentId: string;
    description: string;
    input?: string;
    context?: Record<string, unknown>;
  }): Promise<Task>;

  /** Get task status */
  getTaskStatus(taskId: string): Promise<Task>;

  /** Cancel a running task */
  cancelTask(taskId: string): Promise<boolean>;

  /** Stream task events (messages, status changes) */
  streamTaskEvents(taskId: string): AsyncIterable<TaskEvent>;
}

// ---- Events ----

export interface TaskEvent {
  taskId: string;
  type: "status_change" | "message" | "artifact" | "error";
  payload: unknown;
  timestamp: string;
}

// ---- Protocol Constants ----

export const A2A_PROTOCOL_VERSION = "0.1.0";
