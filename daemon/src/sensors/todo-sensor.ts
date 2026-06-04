import type { Sensor, SensorChange } from "./types.js";
import { getRepositories } from "../db/factory.js";

/**
 * Todo sensor — polls the task repository for changes.
 * Detects new tasks, completions, and overdue items.
 */
export interface TodoSensorOptions {
  /** Check interval in ms (default 60000) */
  intervalMs?: number;
}

export function createTodoSensor(options: TodoSensorOptions = {}): Sensor {
  let lastSnapshot: string | null = null;

  return {
    name: "todo",
    interval: options.intervalMs ?? 60_000,

    async check(): Promise<SensorChange[] | null> {
      try {
        const repos = getRepositories();
        const tasks = await repos.tasks.query();
        const activeTasks = tasks.filter((t) => t.status !== "deleted");

        // Build a snapshot string for change detection
        const snapshot = JSON.stringify(
          activeTasks
            .map((t) => `${t.id}:${t.status}:${t.priority}:${t.dueDate}`)
            .sort()
        );

        if (lastSnapshot === null) {
          lastSnapshot = snapshot;
          return null;
        }

        if (snapshot === lastSnapshot) return null;

        const prevTasks = JSON.parse(lastSnapshot) as string[];
        const prevMap = new Map(prevTasks.map((s) => {
          const [id, status, priority, dueDate] = s.split(":");
          return [id, { status, priority, dueDate }];
        }));

        const changes: SensorChange[] = [];

        // Detect new tasks
        for (const task of activeTasks) {
          if (!prevMap.has(task.id)) {
            changes.push({
              type: "todo_added",
              detail: `New task: ${task.title} (priority ${task.priority})`,
            });
          }
        }

        // Detect completions and status changes
        for (const task of activeTasks) {
          const prev = prevMap.get(task.id);
          if (prev && prev.status !== task.status) {
            if (task.status === "done") {
              changes.push({
                type: "todo_completed",
                detail: `Completed: ${task.title}`,
              });
            } else {
              changes.push({
                type: "todo_status_changed",
                detail: `Task "${task.title}" status: ${prev.status} → ${task.status}`,
              });
            }
          }
        }

        // Detect overdue tasks
        const today = new Date().toISOString().slice(0, 10);
        for (const task of activeTasks) {
          if (task.dueDate && task.dueDate < today && task.status !== "done") {
            changes.push({
              type: "todo_overdue",
              detail: `Overdue: ${task.title} (due ${task.dueDate})`,
            });
          }
        }

        lastSnapshot = snapshot;
        return changes.length > 0 ? changes : null;
      } catch {
        return null;
      }
    },
  };
}
