import { executeSkill } from "./skills/executor.js";
import { getSkill } from "./skills/loader.js";
import type { SkillExecutionResult } from "./skills/types.js";

/**
 * Lightweight cron-style scheduler for recurring skill execution.
 * Supports daily/weekly/monthly schedules without external dependencies.
 */

export interface ScheduledTask {
  id: string;
  name: string;
  skillName: string;
  input?: Record<string, unknown>;
  schedule: ScheduleConfig;
  enabled: boolean;
  lastRun?: string;
  lastResult?: SkillExecutionResult;
  createdAt: string;
}

export interface ScheduleConfig {
  type: "daily" | "weekly" | "monthly" | "interval";
  /** Hour of day (0-23) for daily/weekly/monthly */
  hour?: number;
  /** Minute of hour (0-59) for daily/weekly/monthly */
  minute?: number;
  /** Day of week (0=Sun, 6=Sat) for weekly */
  dayOfWeek?: number;
  /** Day of month (1-31) for monthly */
  dayOfMonth?: number;
  /** Interval in milliseconds for interval type */
  intervalMs?: number;
}

export interface SchedulerState {
  tasks: Map<string, ScheduledTask>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  running: boolean;
}

const state: SchedulerState = {
  tasks: new Map(),
  timers: new Map(),
  running: false,
};

/**
 * Register a scheduled task.
 */
export function scheduleTask(task: Omit<ScheduledTask, "id" | "createdAt">): ScheduledTask {
  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const scheduled: ScheduledTask = {
    ...task,
    id,
    createdAt: new Date().toISOString(),
  };

  state.tasks.set(id, scheduled);

  if (state.running && scheduled.enabled) {
    scheduleNext(scheduled);
  }

  console.log(`[Scheduler] Registered task: ${scheduled.name} (${scheduled.schedule.type})`);
  return scheduled;
}

/**
 * Remove a scheduled task.
 */
export function unscheduleTask(taskId: string): boolean {
  const timer = state.timers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    state.timers.delete(taskId);
  }
  return state.tasks.delete(taskId);
}

/**
 * Enable or disable a scheduled task.
 */
export function toggleTask(taskId: string, enabled: boolean): boolean {
  const task = state.tasks.get(taskId);
  if (!task) return false;

  task.enabled = enabled;

  if (enabled && state.running) {
    scheduleNext(task);
  } else {
    const timer = state.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      state.timers.delete(taskId);
    }
  }

  return true;
}

/**
 * Get all registered scheduled tasks.
 */
export function getScheduledTasks(): ScheduledTask[] {
  return Array.from(state.tasks.values());
}

/**
 * Get a specific scheduled task by ID.
 */
export function getScheduledTask(taskId: string): ScheduledTask | undefined {
  return state.tasks.get(taskId);
}

/**
 * Start the scheduler. Begins executing pending tasks.
 */
export function startScheduler(): void {
  if (state.running) return;
  state.running = true;

  for (const task of state.tasks.values()) {
    if (task.enabled) {
      scheduleNext(task);
    }
  }

  console.log(`[Scheduler] Started with ${state.tasks.size} tasks`);
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

  console.log("[Scheduler] Stopped");
}

/**
 * Check if the scheduler is running.
 */
export function isSchedulerRunning(): boolean {
  return state.running;
}

/**
 * Manually trigger a scheduled task immediately.
 */
export async function triggerTask(taskId: string): Promise<SkillExecutionResult | null> {
  const task = state.tasks.get(taskId);
  if (!task) return null;

  return executeScheduledTask(task);
}

function scheduleNext(task: ScheduledTask): void {
  const existing = state.timers.get(task.id);
  if (existing) {
    clearTimeout(existing);
  }

  const delay = calculateDelay(task.schedule);
  if (delay <= 0) return;

  const timer = setTimeout(async () => {
    await executeScheduledTask(task);
    if (state.running && task.enabled) {
      scheduleNext(task);
    }
  }, delay);

  state.timers.set(task.id, timer);
}

async function executeScheduledTask(task: ScheduledTask): Promise<SkillExecutionResult> {
  console.log(`[Scheduler] Executing: ${task.name}`);

  const skill = getSkill(task.skillName);
  if (!skill) {
    const result: SkillExecutionResult = {
      success: false,
      skillName: task.skillName,
      output: null,
      durationMs: 0,
      steps: [],
      error: `Skill not found: ${task.skillName}`,
    };
    task.lastResult = result;
    return result;
  }

  try {
    const result = await executeSkill(task.skillName, task.input ?? {});
    task.lastRun = new Date().toISOString();
    task.lastResult = result;

    if (result.success) {
      console.log(`[Scheduler] Completed: ${task.name} (${result.durationMs}ms)`);
    } else {
      console.error(`[Scheduler] Failed: ${task.name} — ${result.error}`);
    }

    return result;
  } catch (err) {
    const result: SkillExecutionResult = {
      success: false,
      skillName: task.skillName,
      output: null,
      durationMs: 0,
      steps: [],
      error: err instanceof Error ? err.message : String(err),
    };
    task.lastResult = result;
    console.error(`[Scheduler] Error in ${task.name}:`, err);
    return result;
  }
}

function calculateDelay(schedule: ScheduleConfig): number {
  const now = new Date();

  switch (schedule.type) {
    case "interval":
      return schedule.intervalMs ?? 60_000;

    case "daily": {
      const target = new Date(now);
      target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime() - now.getTime();
    }

    case "weekly": {
      const target = new Date(now);
      const dayDiff = ((schedule.dayOfWeek ?? 0) - now.getDay() + 7) % 7;
      target.setDate(target.getDate() + dayDiff);
      target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 7);
      }
      return target.getTime() - now.getTime();
    }

    case "monthly": {
      const target = new Date(now);
      target.setDate(schedule.dayOfMonth ?? 1);
      target.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      if (target <= now) {
        target.setMonth(target.getMonth() + 1);
      }
      return target.getTime() - now.getTime();
    }

    default:
      return 60_000;
  }
}
