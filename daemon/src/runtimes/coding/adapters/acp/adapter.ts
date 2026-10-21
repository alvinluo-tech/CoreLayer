/**
 * ACP (Agent Client Protocol) coding adapter.
 *
 * Drives an external coding harness through `acpx`, the ACP client CLI used by
 * OpenClaw. The daemon spawns acpx as a child process and reads raw ACP
 * JSON-RPC messages from stdout; nothing about the agent's own tool loop is
 * reimplemented here.
 *
 * Why a subprocess instead of importing the ACP SDK:
 * - the daemon ships as a Node SEA sidecar, and the agent bridges pull
 *   platform-specific native packages that cannot be bundled into it;
 * - the external agent keeps its own OS permission domain.
 *
 * What this adapter is responsible for:
 * - model guard: Claude Code may only run on DeepSeek models;
 * - isolating the agent from the user's `~/.claude` settings, which would
 *   otherwise override the endpoint and model we pass in;
 * - translating `session/update` into Jarvis coding events;
 * - answering `session/request_permission` deterministically (there is no TTY).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CodingAgentAdapter,
  CodingTask,
  CodingRunInfo,
  CodingRunHandle,
  CodingArtifact,
  AdapterAvailability,
} from "../../types.js";
import type { ExecutorCapabilityProfile } from "@jarvis/runtime-protocol";
import type { NormalizedEvent } from "../../events/coding-event.js";
import { CodingEventEmitter } from "../../events/normalize-event.js";
import { getCapabilityBroker } from "../../../../capabilities/os-capability-broker.js";
import { spawnProcessLive, killProcessTree, validateWorkdirPolicy } from "../../process-spawner.js";
import { logAuditEntry } from "../../../../persistence/audit-log.js";
import { persistArtifacts } from "../../artifact-persistence.js";
import { maskObjectSecrets } from "../../../../shared/secret-masking.js";
import { emitWorkspaceEvent } from "../../../../services/workspace-event-emitter.js";
import { locateAcpxRuntime, type AcpxRuntimeLocation } from "./acpx-runtime.js";
import { validateClaudeModel } from "./model-guard.js";
import {
  createToolCallTracker,
  flushOpenToolCalls,
  mapAcpUpdate,
  type AcpSessionUpdate,
  type ToolCallTracker,
} from "./event-mapper.js";
import {
  resolvePermissionDecision,
  toAcpxPermissionPolicy,
  type CodingPermissionPolicy,
  type PermissionOptionView,
} from "./permission-policy.js";
import {
  AcpStreamDecoder,
  isErrorResponse,
  isPermissionRequest,
  isSessionUpdate,
  type AcpJsonRpcMessage,
} from "./jsonrpc-decoder.js";
import { createStderrBuffer, type StderrBuffer } from "./stderr-buffer.js";
import { probeAcpAgent, type AcpCapabilitySnapshot } from "./capability-probe.js";

const runs = new Map<string, CodingRunInfo>();
const processes = new Map<string, number>();
const sessions = new Map<string, AcpRunSession>();
const emitter = new CodingEventEmitter();

/**
 * How long an escalated run is given to finish the turn after the request is
 * answered. The agent needs this window to write its own refusal and wind
 * down; killing the process the instant a permission is escalated loses the
 * partial work and the reason.
 */
const ESCALATION_GRACE_MS = 5_000;

/**
 * What an ACP turn must produce to count as having done anything. A turn that
 * ends with no assistant text and no tool call is a failed turn in practice:
 * measured adapters answer `end_turn` after a provider error and report the
 * error only on stderr.
 */
interface TurnEvidence {
  textChunks: number;
  toolCalls: number;
}

interface AcpRunSession {
  tracker: ToolCallTracker;
  /** Temporary CLAUDE_CONFIG_DIR, removed when the run settles. */
  configDir?: string;
  cancelled: boolean;
  /** Accumulated assistant text for the final summary. */
  transcript: string;
  /** Retained stderr tail, used when the protocol reports success but nothing ran. */
  stderr: StderrBuffer;
  evidence: TurnEvidence;
  /** Set once a permission was escalated to a human; the run is winding down. */
  escalating?: boolean;
  escalationReason?: string;
  escalationTimer?: ReturnType<typeof setTimeout>;
}

function policyForTask(task: CodingTask): CodingPermissionPolicy {
  return task.permissionPolicy ?? "normal";
}

export class AcpCodingAdapter implements CodingAgentAdapter {
  readonly id = "acp" as const;
  readonly displayName = "ACP (Claude Code via acpx)";
  readonly name = "ACP";

  /**
   * What this executor actually guarantees, as opposed to what a CLI wrapper
   * can infer. Tool calls arrive as structured ACP notifications and the
   * permission request is a protocol message rather than a guess from stdout.
   */
  getCapabilities(): ExecutorCapabilityProfile {
    return {
      adapterId: this.id,
      domain: "coding",
      nonInteractive: true,
      streamEvents: true,
      structuredOutput: true,
      permissionMode: true,
      toolConfigInjection: true,
      isolatedEnvironment: true,
      cancellation: true,
      resumableSession: true,
      permissionProjection: "native",
      approvalResumeStrategy: "native_session_resume",
      defaultTimeoutMs: 300_000,
      metadata: {
        transport: "acp",
        structuredEventFormat: "acp-jsonrpc",
        approvalGranularity: "per-tool",
        nativeToolApprovalIntercepted: true,
      },
    };
  }

  async discover(): Promise<AdapterAvailability> {
    const runtime = locateAcpxRuntime();
    if (!runtime) {
      return {
        available: false,
        reason: "acpx not found. Install it with: npm install acpx (or add it as a daemon dependency)",
        transport: "cli",
      };
    }

    try {
      const output = execFileSync(runtime.command, [...runtime.prefixArgs, "--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      }).toString().trim();
      return { available: true, version: output, transport: "cli" };
    } catch {
      return { available: true, version: undefined, transport: "cli" };
    }
  }

  /**
   * Measure whether the configured ACP agent can actually start a session.
   *
   * `discover()` only proves acpx is installed. This performs the ACP handshake
   * without running a prompt turn, so a caller can distinguish "ready" from
   * "needs a login" from "the launch command is broken" before spending a run.
   */
  async probe(agent: string, cwd: string, model?: string): Promise<AcpCapabilitySnapshot> {
    return probeAcpAgent({ agent, cwd, model });
  }

  async startRun(task: CodingTask): Promise<CodingRunHandle> {
    const runId = task.dbRunId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const runtime = locateAcpxRuntime();
    if (!runtime) {
      const info = failedInfo(runId, task, now, "acpx not found. Install it with: npm install acpx");
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    if (!task.repoPath) {
      const info = failedInfo(runId, task, now, "repoPath is required but was not provided");
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    const cwd = task.worktreePath ?? task.repoPath;
    const workdirPolicy = validateWorkdirPolicy(cwd);
    if (!workdirPolicy.allowed) {
      const info = failedInfo(runId, task, now, workdirPolicy.reason ?? "Invalid working directory");
      runs.set(runId, info);
      await logAuditEntry({
        actor: "system",
        action: "run.start",
        resource: runId,
        decision: "denied",
        result: workdirPolicy.reason,
        metadata: { adapterId: this.id, cwd },
      });
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    // Claude Code must never inherit the model a user picked for other tools.
    // A Claude label routed at a DeepSeek endpoint fails as model_not_found,
    // which then looks like a credential problem.
    const model = resolveClaudeModel(task);
    const modelVerdict = validateClaudeModel(model);
    if (!modelVerdict.allowed) {
      const info = failedInfo(runId, task, now, modelVerdict.reason);
      runs.set(runId, info);
      await logAuditEntry({
        actor: "system",
        action: "run.start",
        resource: runId,
        decision: "denied",
        result: modelVerdict.reason,
        metadata: { adapterId: this.id, model: model ?? null },
      });
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    const broker = getCapabilityBroker();
    const maskedPrompt = maskObjectSecrets({ taskPrompt: task.taskPrompt }).taskPrompt as string;
    const decision = await broker.requestShellExec(
      "coding-runtime",
      `acpx --format json claude "${String(maskedPrompt).slice(0, 100)}..."`,
      { reason: `ACP run for repo: ${task.repoPath}` },
    );

    if (decision.decision === "deny") {
      const info = failedInfo(runId, task, now, `Permission denied: ${decision.reason}`);
      runs.set(runId, info);
      return { runId, adapterId: this.id, status: "failed", startedAt: now };
    }

    if (decision.decision === "approval_required") {
      runs.set(runId, { runId, adapterId: this.id, status: "pending", task, startedAt: now, artifacts: [] });
      emitter.emit(runId, { type: "approval_requested", risk: "shell_exec", reason: decision.reason });
      return { runId, adapterId: this.id, status: "pending", startedAt: now };
    }

    const info: CodingRunInfo = { runId, adapterId: this.id, status: "running", task, startedAt: now, artifacts: [] };
    runs.set(runId, info);

    await logAuditEntry({
      actor: "user",
      action: "run.start",
      resource: runId,
      decision: "allowed",
      result: "success",
      metadata: { adapterId: this.id, cwd, model: modelVerdict.model, prompt: String(maskedPrompt).slice(0, 100) },
    });

    emitter.emit(runId, { type: "run_started", runId });
    emitWorkspaceEvent({
      type: "workspace.run.started",
      title: "ACP run started",
      summary: `Task: ${task.taskPrompt.slice(0, 60)}...`,
      severity: "info",
      workspaceId: task.workspaceId ?? "",
      projectId: task.projectId,
      taskId: task.dbTaskId,
      agentRunId: runId,
      runtimeId: this.id,
      payload: {
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? "",
        taskId: task.dbTaskId ?? "",
        agentRunId: runId,
        runtimeId: this.id,
        repoPath: task.repoPath,
        worktreePath: task.worktreePath,
        timeoutMs: task.timeoutMs,
      },
    });

    const pid = this.spawnAcpx(runId, task, runtime, modelVerdict.model);
    return { runId, adapterId: this.id, status: "running", pid, startedAt: now };
  }

  private spawnAcpx(
    runId: string,
    task: CodingTask,
    runtime: AcpxRuntimeLocation,
    model: string,
  ): number | undefined {
    const policy = policyForTask(task);
    const args = [
      ...runtime.prefixArgs,
      "--cwd",
      task.worktreePath ?? task.repoPath,
      "--format",
      "json",
      "--json-strict",
      "--model",
      model,
      // Writes are approved by this adapter, not by acpx's own resolver, so
      // acpx must not deny or fail a request it does not recognise.
      "--approve-reads",
      "--non-interactive-permissions",
      "deny",
      "--permission-policy",
      JSON.stringify(toAcpxPermissionPolicy(policy)),
    ];
    if (task.allowedTools && task.allowedTools.length > 0) {
      args.push("--allowed-tools", task.allowedTools.join(","));
    }
    if (task.timeoutMs && task.timeoutMs > 0) {
      args.push("--timeout", String(Math.ceil(task.timeoutMs / 1000)));
    }
    args.push("claude", "exec", task.taskPrompt);

    const configDir = createIsolatedClaudeConfigDir();
    const env: Record<string, string> = { ANTHROPIC_MODEL: model };
    if (configDir) env.CLAUDE_CONFIG_DIR = configDir;

    const session: AcpRunSession = {
      tracker: createToolCallTracker(),
      configDir,
      cancelled: false,
      transcript: "",
      stderr: createStderrBuffer(),
      evidence: { textChunks: 0, toolCalls: 0 },
    };
    sessions.set(runId, session);

    const decoder = new AcpStreamDecoder();
    let promptCompleted = false;
    let promptError: string | undefined;

    const handle = spawnProcessLive({
      command: runtime.command,
      args,
      cwd: task.worktreePath ?? task.repoPath,
      env,
      timeoutMs: task.timeoutMs ?? 300_000,
      onStdout: (chunk) => {
        for (const message of decoder.push(chunk)) {
          this.handleMessage(runId, session, message, {
            onPromptDone: (error) => {
              promptCompleted = true;
              promptError = error;
            },
          });
        }
      },
      onStderr: (chunk) => {
        const text = chunk.trim();
        if (!text) return;
        session.stderr.push(chunk);
        emitter.emit(runId, { type: "agent_message", text: `[stderr] ${text}` });
      },
    });

    if (handle.pid) processes.set(runId, handle.pid);

    handle.process.on("close", (code) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info || info.status !== "running") {
        cleanupSession(runId);
        return;
      }

      // Anything still open at exit never reported a terminal status.
      for (const event of flushOpenToolCalls(session.tracker)) emitter.emit(runId, event);

      info.completedAt = new Date().toISOString();
      info.durationMs = Date.now() - new Date(info.startedAt).getTime();

      const protocolSucceeded = !session.cancelled && (promptCompleted ? promptError === undefined : code === 0);
      // A turn that produced neither text nor a tool call did nothing, whatever
      // the stop reason says. Measured adapters report `end_turn` after a
      // provider error and leave the cause on stderr.
      const emptyTurn =
        protocolSucceeded &&
        session.evidence.textChunks === 0 &&
        session.evidence.toolCalls === 0 &&
        session.transcript.trim().length === 0;

      const succeeded = protocolSucceeded && !emptyTurn && !session.escalating;
      if (succeeded) {
        info.status = "succeeded";
        const summary = session.transcript.trim() || handle.stdout.join("") || "Task completed successfully";
        info.artifacts.push({ type: "final_summary", content: summary });
        emitter.emit(runId, { type: "run_completed", summary });
        emitWorkspaceEvent({
          type: "workspace.run.completed",
          title: "ACP run completed",
          summary: `Duration: ${info.durationMs}ms, ${info.artifacts.length} artifacts`,
          severity: "success",
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          runtimeId: this.id,
          payload: {
            workspaceId: task.workspaceId ?? "",
            projectId: task.projectId ?? "",
            taskId: task.dbTaskId ?? "",
            agentRunId: runId,
            runtimeId: this.id,
            durationMs: info.durationMs ?? 0,
            artifactCount: info.artifacts.length,
          },
        });
      } else if (!session.cancelled) {
        info.status = "failed";
        info.error = resolveFailureReason({
          promptError,
          escalation: session.escalationReason,
          emptyTurn,
          stderrTail: session.stderr.text(),
          exitCode: code,
        });
        info.artifacts.push({ type: "error", content: info.error });
        emitter.emit(runId, { type: "run_failed", error: info.error });
        emitWorkspaceEvent({
          type: "workspace.run.failed",
          title: "ACP run failed",
          summary: info.error.slice(0, 100),
          severity: "error",
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId,
          taskId: task.dbTaskId,
          agentRunId: runId,
          runtimeId: this.id,
          payload: {
            workspaceId: task.workspaceId ?? "",
            projectId: task.projectId ?? "",
            taskId: task.dbTaskId ?? "",
            agentRunId: runId,
            runtimeId: this.id,
            error: info.error,
          },
        });
      }

      collectChangedFiles(info, task);
      persistArtifacts(runId, info.artifacts, task.conversationId, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.dbTaskId,
        agentRunId: runId,
        runtimeId: this.id,
      });
      cleanupSession(runId);
    });

    handle.process.on("error", (err) => {
      processes.delete(runId);
      const info = runs.get(runId);
      if (!info) return;
      info.status = "failed";
      info.error = err.message;
      info.completedAt = new Date().toISOString();
      info.artifacts.push({ type: "error", content: info.error });
      persistArtifacts(runId, info.artifacts, task.conversationId, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.dbTaskId,
        agentRunId: runId,
        runtimeId: this.id,
      });
      emitter.emit(runId, { type: "run_failed", error: err.message });
      cleanupSession(runId);
    });

    return handle.pid;
  }

  private handleMessage(
    runId: string,
    session: AcpRunSession,
    message: AcpJsonRpcMessage,
    hooks: { onPromptDone: (error?: string) => void },
  ): void {
    if (isSessionUpdate(message)) {
      const update = message.params?.update as AcpSessionUpdate | undefined;
      if (!update) return;
      const mapping = mapAcpUpdate(update, session.tracker);
      if (mapping.agentText) {
        session.transcript += mapping.agentText;
        session.evidence.textChunks += 1;
      }
      for (const event of mapping.events) {
        if (event.type === "tool_call") session.evidence.toolCalls += 1;
        emitter.emit(runId, event);
      }
      return;
    }

    if (isPermissionRequest(message)) {
      this.answerPermission(runId, session, message);
      return;
    }

    if (isErrorResponse(message) && message.id !== undefined) {
      // acpx reports the prompt turn failure on the `session/prompt` id.
      const error = message.error;
      const detail = typeof error?.data === "object" && error.data
        ? JSON.stringify(error.data).slice(0, 500)
        : "";
      hooks.onPromptDone(`${error?.message ?? "ACP request failed"}${detail ? ` (${detail})` : ""}`);
      emitter.emit(runId, { type: "agent_message", text: `[error] ${error?.message ?? "ACP request failed"}` });
      return;
    }

    if (message.method === "session/prompt" && message.result) {
      hooks.onPromptDone(undefined);
    }
  }

  private answerPermission(
    runId: string,
    session: AcpRunSession | undefined,
    message: AcpJsonRpcMessage,
  ): void {
    const info = runs.get(runId);
    const task = info?.task;
    const policy: CodingPermissionPolicy = task ? policyForTask(task) : "normal";
    const params = message.params ?? {};
    const toolCall = (params.toolCall ?? {}) as Record<string, unknown>;
    const options = Array.isArray(params.options) ? (params.options as PermissionOptionView[]) : [];

    const decision = resolvePermissionDecision(
      policy,
      {
        toolCallId: typeof toolCall.toolCallId === "string" ? toolCall.toolCallId : undefined,
        kind: typeof toolCall.kind === "string" ? toolCall.kind : undefined,
        title: typeof toolCall.title === "string" ? toolCall.title : undefined,
        rawInput: toolCall.rawInput,
      },
      options,
    );

    // acpx owns the agent's stdin and answers this request with its own
    // `--permission-policy`, so the reply on the wire is not ours to send.
    // Killing the process here is the only way to refuse the action; what has
    // to change is when: the answer rides out first so the agent can wind its
    // turn down and keep whatever it had already produced, and the kill is only
    // the backstop for an agent that ignores the refusal.
    const pid = processes.get(runId);
    if (decision.action === "escalate") {
      if (session) {
        session.escalating = true;
        session.escalationReason = decision.reason;
        if (!session.escalationTimer && pid) {
          session.escalationTimer = setTimeout(() => {
            killProcessTree(pid);
          }, ESCALATION_GRACE_MS);
          session.escalationTimer.unref?.();
        }
      }
      emitter.emit(runId, {
        type: "approval_requested",
        risk: "escalation",
        reason: decision.reason,
      });
      return;
    }

    emitter.emit(runId, { type: "approval_requested", risk: inferRisk(decision.action), reason: decision.reason });
  }

  async getRunStatus(runId: string): Promise<CodingRunInfo> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);
    return info;
  }

  async *streamRunEvents(runId: string): AsyncIterable<NormalizedEvent> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);

    const { iterable } = emitter.createStream(runId);
    emitter.emit(runId, { type: "run_started", runId });
    yield* iterable;

    emitter.emit(
      runId,
      info.status === "succeeded"
        ? { type: "run_completed", summary: info.artifacts.find((a) => a.type === "final_summary")?.content ?? "Done" }
        : { type: "run_failed", error: info.error ?? "Unknown error" },
    );
    emitter.cleanup(runId);
  }

  async cancelRun(runId: string): Promise<boolean> {
    const info = runs.get(runId);
    if (!info) return false;
    if (info.status !== "running" && info.status !== "pending") return false;

    const session = sessions.get(runId);
    if (session) session.cancelled = true;

    const pid = processes.get(runId);
    if (pid) {
      killProcessTree(pid);
      processes.delete(runId);
    }

    info.status = "cancelled";
    info.completedAt = new Date().toISOString();
    info.durationMs = Date.now() - new Date(info.startedAt).getTime();
    emitter.emit(runId, { type: "run_cancelled", reason: "Cancelled by user" });
    await logAuditEntry({
      actor: "user",
      action: "run.cancel",
      resource: runId,
      decision: "allowed",
      result: "success",
      metadata: { adapterId: this.id },
    });
    cleanupSession(runId);
    return true;
  }

  async collectArtifacts(runId: string): Promise<CodingArtifact[]> {
    const info = runs.get(runId);
    if (!info) throw new Error(`Coding run not found: ${runId}`);
    return info.artifacts;
  }

  /** @deprecated Use startRun() instead. */
  async createRun(task: CodingTask): Promise<CodingRunInfo> {
    const handle = await this.startRun(task);
    return this.getRunStatus(handle.runId);
  }
}

/**
 * Claude Code is restricted to DeepSeek models. The executor policy may pin a
 * model; otherwise the ambient ANTHROPIC_MODEL applies.
 */
export function resolveClaudeModel(task: CodingTask): string | undefined {
  const pinned = task.executorModel?.trim();
  if (pinned) return pinned;
  return process.env.ANTHROPIC_MODEL?.trim() || undefined;
}

/**
 * Return a scratch CLAUDE_CONFIG_DIR so the external agent does not read the
 * user's `~/.claude/settings.json`.
 *
 * The Claude Agent SDK applies that file's `env` block over the parent process
 * environment, which silently replaces ANTHROPIC_BASE_URL and the model with
 * whatever the user last configured for interactive use.
 */
function createIsolatedClaudeConfigDir(): string | undefined {
  try {
    const dir = mkdtempSync(join(tmpdir(), "jarvis-acp-claude-"));
    writeFileSync(join(dir, "settings.json"), "{}\n", "utf-8");
    return dir;
  } catch {
    return undefined;
  }
}

function resolveFailureReason(input: {
  promptError?: string;
  escalation?: string;
  emptyTurn: boolean;
  stderrTail: string;
  exitCode: number | null;
}): string {
  if (input.escalation) return input.escalation;
  if (input.promptError) return input.promptError;
  if (input.emptyTurn) {
    const tail = input.stderrTail.trim().split("\n").slice(-3).join(" | ");
    return tail
      ? `ACP turn produced no output; stderr: ${tail}`
      : "ACP turn produced no output and reported no error";
  }
  return input.stderrTail.trim() || `Exit code ${input.exitCode}`;
}

function cleanupSession(runId: string): void {
  const session = sessions.get(runId);
  if (!session) return;
  if (session.escalationTimer) clearTimeout(session.escalationTimer);
  if (session.configDir) {
    try {
      rmSync(session.configDir, { recursive: true, force: true });
    } catch {
      // Best effort; the temp directory is harmless if left behind.
    }
  }
  sessions.delete(runId);
}

function collectChangedFiles(info: CodingRunInfo, task: CodingTask): void {
  try {
    const repoPath = task.worktreePath ?? task.repoPath;
    const output = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    }).toString().trim();
    if (output) {
      info.artifacts.push({ type: "changed_files", content: output, metadata: { repoPath } });
    }
  } catch {
    // git status failed — the run's own artifacts still stand.
  }
}

function failedInfo(runId: string, task: CodingTask, now: string, error: string): CodingRunInfo {
  return {
    runId,
    adapterId: "acp",
    status: "failed",
    task,
    startedAt: now,
    completedAt: now,
    artifacts: [{ type: "error", content: error }],
    error,
  };
}

function inferRisk(action: "approve" | "deny"): string {
  return action === "deny" ? "tool_denied" : "tool_approved";
}
