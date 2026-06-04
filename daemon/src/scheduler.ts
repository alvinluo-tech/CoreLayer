import { CronExpressionParser } from "cron-parser";
import { executeSkill } from "./skills/executor.js";
import { getSkill } from "./skills/loader.js";
import { getRepositories } from "./db/factory.js";
import type { ScheduledTaskRow } from "./db/repository.js";
import { logError } from "./utils/errors.js";

/**
 * Scheduler for recurring task execution.
 * Supports cron expressions (via cron-parser) and prompt-based execution.
 * Persists task state to DB on every change.
 */

// ---- Activity tracking for idle detection ----

let lastActivityTimestamp = Date.now();

/** Record user activity (call on each message handled). */
export function recordActivity(): void {
  lastActivityTimestamp = Date.now();
}

/** Get milliseconds since last activity. */
export function getIdleMs(): number {
  return Date.now() - lastActivityTimestamp;
}

// ---- TICK system (autonomous idle processing) ----

/** Minimum interval between TICK executions (30 minutes) */
const TICK_INTERVAL_MS = 30 * 60 * 1000;

/** Prefix that marks an agent response as silent (not shown in UI) */
export const NO_REPLY_PREFIX = "NO_REPLY";

let lastTickAt = 0;

/**
 * Check if enough time has elapsed since the last TICK.
 */
export function canRunTick(): boolean {
  return Date.now() - lastTickAt >= TICK_INTERVAL_MS;
}

/**
 * Get milliseconds since the last TICK execution.
 */
export function getTickAgeMs(): number {
  return Date.now() - lastTickAt;
}

/**
 * Reset TICK state (for testing).
 */
export function resetTickState(): void {
  lastTickAt = 0;
}

/**
 * Run an autonomous TICK: memory consolidation, todo checks, etc.
 * Uses NO_REPLY mode — conversations created during TICK are cleaned up
 * if the agent responds with NO_REPLY prefix.
 */
export async function runTick(): Promise<{
  ran: boolean;
  conversationsProcessed: number;
  error?: string;
}> {
  if (!canRunTick()) {
    return { ran: false, conversationsProcessed: 0 };
  }

  lastTickAt = Date.now();

  try {
    // Run existing consolidation logic
    const result = await consolidateOnIdle();

    // Create a TICK conversation for L2 agent processing
    const { handleMessageInConversation } = await import("./orchestrator/conversation.js");
    const repos = getRepositories();
    const conv = await repos.conversations.create("TICK: autonomous processing");

    await handleMessageInConversation(
      conv.id,
      "[TICK] 自主处理：请检查并执行以下任务（如果没有需要处理的，回复 NO_REPLY）：\n" +
        "1. 检查是否有过期的待办事项\n" +
        "2. 检查阅读列表中是否有长时间未阅读的文章\n" +
        "3. 整理近期对话中的关键信息到记忆",
    );

    // Check if agent replied with NO_REPLY — clean up if so
    const messages = await repos.conversations.getMessages(conv.id);
    const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
    if (lastAssistant?.content?.startsWith(NO_REPLY_PREFIX)) {
      // Delete the TICK conversation — it produced no useful output
      for (const msg of messages) {
        await repos.conversations.deleteMessage(msg.id);
      }
      await repos.conversations.delete(conv.id);
    }

    return { ran: true, conversationsProcessed: result.conversationsProcessed };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logError("Scheduler/tick", error);
    return { ran: true, conversationsProcessed: 0, error };
  }
}

// ---- Scheduler state ----

interface SchedulerState {
  /** In-memory timers keyed by task ID */
  timers: Map<string, ReturnType<typeof setTimeout>>;
  /** Idle check timer */
  idleTimer: ReturnType<typeof setInterval> | null;
  running: boolean;
  /** Idle threshold in ms (default 10 minutes) */
  idleThresholdMs: number;
  /** Callback invoked on idle for consolidation */
  onIdle: (() => Promise<unknown>) | null;
}

const state: SchedulerState = {
  timers: new Map(),
  idleTimer: null,
  running: false,
  idleThresholdMs: 10 * 60 * 1000,
  onIdle: null,
};

// ---- Task execution ----

export type TaskExecutionResult = {
  success: boolean;
  taskName: string;
  output: unknown;
  durationMs: number;
  error?: string;
};

/**
 * Execute a scheduled task. Supports both skill-based and prompt-based execution.
 */
async function executeTask(row: ScheduledTaskRow): Promise<TaskExecutionResult> {
  const start = Date.now();

  // Prompt-based execution: send prompt through orchestrator
  if (row.prompt) {
    try {
      const { handleMessageInConversation } = await import("./orchestrator/conversation.js");
      const conv = await getRepositories().conversations.create(`Scheduled: ${row.name}`);
      await handleMessageInConversation(conv.id, row.prompt);
      return {
        success: true,
        taskName: row.name,
        output: { prompt: row.prompt, conversationId: conv.id },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        taskName: row.name,
        output: null,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Skill-based execution
  if (row.skillName) {
    if (!getSkill(row.skillName)) {
      return {
        success: false,
        taskName: row.name,
        output: null,
        durationMs: Date.now() - start,
        error: `Skill not found: ${row.skillName}`,
      };
    }

    try {
      const input = (typeof row.input === "object" && row.input !== null)
        ? row.input as Record<string, unknown>
        : {};
      const result = await executeSkill(row.skillName, input);
      return {
        success: result.success,
        taskName: row.name,
        output: result.output,
        durationMs: Date.now() - start,
        error: result.error ?? undefined,
      };
    } catch (err) {
      return {
        success: false,
        taskName: row.name,
        output: null,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    success: false,
    taskName: row.name,
    output: null,
    durationMs: Date.now() - start,
    error: "Task has neither prompt nor skillName",
  };
}

/**
 * Compute next fire time from cron expression.
 */
export function computeNextRun(cronExpr: string, from?: Date): string {
  const interval = CronExpressionParser.parse(cronExpr, { currentDate: from });
  const next = interval.next();
  if (!next) throw new Error("No next execution time");
  return next.toISOString() ?? new Date().toISOString();
}

// ---- Scheduler lifecycle ----

/**
 * Start the scheduler. Loads tasks from DB and begins scheduling.
 */
export async function startScheduler(): Promise<void> {
  if (state.running) return;
  state.running = true;

  try {
    const tasks = await getRepositories().scheduledTasks.getAll();
    for (const task of tasks) {
      if (task.enabled) {
        scheduleTaskTimer(task);
      }
    }
    logError("Scheduler", `Started with ${tasks.length} tasks`);
  } catch (err) {
    logError("Scheduler/start", err);
  }

  // Start idle check interval (every minute)
  state.idleTimer = setInterval(checkIdle, 60_000);
}

/**
 * Stop the scheduler. Cancels all pending timers.
 */
export function stopScheduler(): void {
  state.running = false;

  for (const timer of state.timers.values()) {
    clearTimeout(timer);
  }
  state.timers.clear();

  if (state.idleTimer) {
    clearInterval(state.idleTimer);
    state.idleTimer = null;
  }
}

/**
 * Check if the scheduler is running.
 */
export function isSchedulerRunning(): boolean {
  return state.running;
}

/**
 * Manually trigger a task immediately.
 */
export async function triggerTask(taskId: string): Promise<TaskExecutionResult | null> {
  const task = await getRepositories().scheduledTasks.getById(taskId);
  if (!task) return null;

  const result = await executeTask(task);
  const now = new Date();
  let nextRun: string | null = null;
  try {
    nextRun = computeNextRun(task.cronExpr, now);
  } catch {
    // Invalid cron — leave nextRun null
  }
  await getRepositories().scheduledTasks.updateLastRun(taskId, now.toISOString(), nextRun ?? "", result);
  return result;
}

/**
 * Register the idle callback for memory consolidation.
 */
export function setIdleCallback(callback: () => Promise<unknown>): void {
  state.onIdle = callback;
}

/**
 * Set idle threshold in milliseconds.
 */
export function setIdleThreshold(ms: number): void {
  state.idleThresholdMs = ms;
}

// ---- Internal scheduling ----

function scheduleTaskTimer(row: ScheduledTaskRow): void {
  const existing = state.timers.get(row.id);
  if (existing) {
    clearTimeout(existing);
  }

  let nextFireMs: number;
  try {
    const interval = CronExpressionParser.parse(row.cronExpr);
    const nextDate = interval.next();
    nextFireMs = nextDate.getTime() - Date.now();
  } catch (err) {
    logError("Scheduler/schedule", `Invalid cron for ${row.name}: ${err}`);
    return;
  }

  if (nextFireMs <= 0) {
    // Already past, schedule for immediate execution
    nextFireMs = 1000;
  }

  const timer = setTimeout(async () => {
    await fireTask(row);
    if (state.running) {
      // Reload from DB to get potentially updated config
      const updated = await getRepositories().scheduledTasks.getById(row.id);
      if (updated?.enabled) {
        scheduleTaskTimer(updated);
      }
    }
  }, nextFireMs);

  state.timers.set(row.id, timer);
}

async function fireTask(row: ScheduledTaskRow): Promise<void> {
  logError("Scheduler", `Executing: ${row.name}`);

  const result = await executeTask(row);
  const now = new Date();

  let nextRun: string | null = null;
  try {
    nextRun = computeNextRun(row.cronExpr, now);
  } catch {
    // Invalid cron
  }

  await getRepositories().scheduledTasks.updateLastRun(
    row.id,
    now.toISOString(),
    nextRun ?? "",
    result,
  );

  if (result.success) {
    logError("Scheduler", `Completed: ${row.name} (${result.durationMs}ms)`);
  } else {
    logError("Scheduler", `Failed: ${row.name} — ${result.error}`);
  }
}

// ---- Idle check ----

async function checkIdle(): Promise<void> {
  if (!state.running) return;
  if (getIdleMs() < state.idleThresholdMs) return;

  // Run idle callback (consolidation) if registered
  if (state.onIdle) {
    try {
      await state.onIdle();
    } catch (err) {
      logError("Scheduler/idle", err);
    }
  }

  // Run TICK (autonomous processing) with frequency limiting
  if (canRunTick()) {
    try {
      await runTick();
    } catch (err) {
      logError("Scheduler/tick", err);
    }
  }
}

// ---- Idle consolidation ----

/** Minimum messages required before compression makes sense */
const CONSOLIDATION_MIN_MESSAGES = 6;

/**
 * Consolidate conversations and prune memories during idle time.
 * Called periodically when user has been idle for the threshold duration.
 */
export async function consolidateOnIdle(): Promise<{
  conversationsProcessed: number;
  preferencesExtracted: number;
  memoriesPruned: number;
}> {
  const repos = getRepositories();
  let conversationsProcessed = 0;
  let preferencesExtracted = 0;
  let memoriesPruned = 0;

  // 1. Find recent conversations with >6 messages
  const conversations = await repos.conversations.list();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const recentConversations = conversations.filter(
    (c) => c.messageCount >= CONSOLIDATION_MIN_MESSAGES && new Date(c.updatedAt) >= cutoff,
  );

  // 2. Compress each conversation
  const { compressConversation, extractPreferences } = await import("./orchestrator/compressor.js");

  for (const conv of recentConversations) {
    try {
      const messages = await repos.conversations.getMessages(conv.id);
      if (messages.length < CONSOLIDATION_MIN_MESSAGES) continue;

      const result = await compressConversation(messages, conv.id);

      // Save summary as system message
      if (result.summary) {
        await repos.conversations.addMessage(conv.id, {
          role: "system",
          content: `[对话摘要 - 压缩了 ${result.compressedMessages.length} 条消息]\n\n${result.summary}`,
        });
      }

      // Extract preferences from summary
      if (result.summary) {
        const prefs = await extractPreferences(result.summary);
        if (prefs.length > 0) {
          await repos.memories.upsertPreferences(prefs);
          preferencesExtracted += prefs.length;
        }
      }

      conversationsProcessed++;
    } catch (err) {
      logError("Scheduler/consolidate", `Failed to compress conversation ${conv.id}: ${err}`);
    }
  }

  // 3. Clean expired memories
  const expiredCleaned = await repos.memories.cleanExpired();

  // 4. Prune unused old memories (default 30 days)
  const pruned = await repos.memories.pruneUnusedMemories(30);

  memoriesPruned = expiredCleaned + pruned;

  logError(
    "Scheduler/consolidate",
    `Done: ${conversationsProcessed} conversations compressed, ${preferencesExtracted} preferences extracted, ${memoriesPruned} memories pruned`,
  );

  return { conversationsProcessed, preferencesExtracted, memoriesPruned };
}
