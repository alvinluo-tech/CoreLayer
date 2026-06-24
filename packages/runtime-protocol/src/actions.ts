/**
 * Runtime Action Types — structured representation of permission-relevant operations.
 *
 * All permission-relevant operations are normalized into RuntimeAction
 * before being evaluated by the policy engine.
 */

/** Action types that require permission evaluation */
export type RuntimeActionType =
  | 'file.read'
  | 'file.write'
  | 'file.delete'
  | 'shell.exec'
  | 'network.request'
  | 'git.read'
  | 'git.write'
  | 'mcp.call'
  | 'credential.read'
  | 'process.spawn'
  | 'external.write';

/** Risk classification */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Structured action for policy evaluation */
export interface RuntimeAction {
  /** Unique action ID */
  id: string;
  /** Action type */
  type: RuntimeActionType;
  /** Workspace context */
  workspaceId?: string;
  /** Project context */
  projectId?: string;
  /** Run context */
  runId?: string;
  /** Task context */
  taskId?: string;
  /** Agent requesting the action */
  agentId?: string;
  /** Executor performing the action */
  executorId?: string;
  /** Current working directory */
  cwd?: string;
  /** Target resource (file path, URL, command, etc.) */
  target?: string;
  /** Raw command if shell.exec */
  rawCommand?: string;
  /** Additional arguments */
  args?: unknown;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Normalize a shell command into a RuntimeAction.
 */
export function normalizeShellCommand(
  command: string,
  cwd: string,
  context: { runId?: string; agentId?: string; executorId?: string; workspaceId?: string }
): RuntimeAction {
  // Classify git commands
  if (command.startsWith('git ')) {
    const subcommand = command.split(/\s+/)[1] ?? '';
    const readCommands = ['status', 'diff', 'log', 'show', 'branch', 'remote', 'tag'];
    const isRead = readCommands.includes(subcommand);

    return {
      id: crypto.randomUUID(),
      type: isRead ? 'git.read' : 'git.write',
      cwd,
      target: command,
      rawCommand: command,
      ...context,
    };
  }

  return {
    id: crypto.randomUUID(),
    type: 'shell.exec',
    cwd,
    target: command,
    rawCommand: command,
    ...context,
  };
}

/**
 * Normalize a file operation into a RuntimeAction.
 */
export function normalizeFileOperation(
  operation: 'read' | 'write' | 'delete',
  path: string,
  context: { runId?: string; agentId?: string; executorId?: string; workspaceId?: string }
): RuntimeAction {
  return {
    id: crypto.randomUUID(),
    type: `file.${operation}` as RuntimeActionType,
    target: path,
    ...context,
  };
}
