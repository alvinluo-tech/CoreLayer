/**
 * TaskGraph — dependency resolution and execution tracking for the task graph.
 *
 * Responsibilities:
 * - Check if a task can execute (all dependencies completed)
 * - Get all executable tasks for a project
 * - Mark tasks complete and unblock dependents
 * - Detect circular dependencies
 */

import { getRepositories } from "../persistence/factory.js";
import type { TaskRow } from "../persistence/repository.js";
import { isTaskComplete, isTaskExecutable } from "./task-status.js";
import { emitWorkspaceEvent } from "../services/workspace-event-emitter.js";

export class TaskGraph {
  /**
   * Check if a task can execute — all its dependencies must be completed.
   */
  async canExecute(taskId: string): Promise<boolean> {
    const { tasks } = getRepositories();
    const task = await tasks.getById(taskId);
    if (!task) return false;

    const deps = task.dependencies;
    if (deps.length === 0) return true;

    const depTasks = await Promise.all(deps.map((id) => tasks.getById(id)));
    return depTasks.every((dep) => dep && isTaskComplete(dep.status));
  }

  /**
   * Return incomplete dependency IDs for the current task.
   */
  async getIncompleteDependencies(taskId: string): Promise<string[]> {
    const { tasks } = getRepositories();
    const task = await tasks.getById(taskId);
    if (!task) return [];

    const incompleteDeps: string[] = [];
    for (const depId of task.dependencies) {
      const dep = await tasks.getById(depId);
      if (!dep || !isTaskComplete(dep.status)) {
        incompleteDeps.push(depId);
      }
    }
    return incompleteDeps;
  }

  /**
   * Get all tasks in a project that are ready to execute.
   * A task is executable if:
   * - Its status is "queued" or "pending"
   * - All dependencies are completed
   */
  async getExecutableTasks(projectId: string): Promise<TaskRow[]> {
    const { tasks } = getRepositories();
    const projectTasks = await tasks.getByProjectId(projectId);

    const executable: TaskRow[] = [];
    for (const task of projectTasks) {
      if (!isTaskExecutable(task.status)) continue;

      if (await this.canExecute(task.id)) {
        executable.push(task);
      }
    }
    return executable;
  }

  /**
   * Mark a task as completed and unblock tasks that depend on it.
   */
  async completeTask(taskId: string): Promise<void> {
    const { tasks } = getRepositories();
    const task = await tasks.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const wasAlreadyComplete = isTaskComplete(task.status);

    if (!wasAlreadyComplete) {
      await tasks.update(taskId, { status: "completed" });

      emitWorkspaceEvent({
        type: "workspace.task.completed",
        title: "Task completed",
        summary: task.title,
        severity: "success",
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? undefined,
        taskId: task.id,
        payload: {
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId ?? "",
          taskId: task.id,
          taskTitle: task.title,
        },
      });
    }

    const projectTasks = task.projectId
      ? await tasks.getByProjectId(task.projectId)
      : [];

    for (const dependent of projectTasks) {
      if (!dependent.dependencies.includes(taskId)) continue;

      const blockedBy = await this.getIncompleteDependencies(dependent.id);
      if (
        blockedBy.length === 0 &&
        (dependent.status === "blocked" || isTaskExecutable(dependent.status))
      ) {
        await tasks.update(dependent.id, {
          status: "queued",
          blockedBy: [],
        });

        emitWorkspaceEvent({
          type: "workspace.task.unblocked",
          title: "Task unblocked",
          summary: dependent.title,
          severity: "info",
          workspaceId: dependent.workspaceId ?? "",
          projectId: dependent.projectId ?? undefined,
          taskId: dependent.id,
          payload: {
            workspaceId: dependent.workspaceId ?? "",
            projectId: dependent.projectId ?? "",
            taskId: dependent.id,
            taskTitle: dependent.title,
            unblockedBy: taskId,
          },
        });
      } else if (blockedBy.length !== dependent.blockedBy.length ||
        blockedBy.some((id, index) => id !== dependent.blockedBy[index])) {
        await tasks.update(dependent.id, { blockedBy });
      }
    }
  }

  /**
   * Detect circular dependencies in a project.
   * Returns an array of cycles, each cycle being an array of task IDs.
   */
  async detectCycles(projectId: string): Promise<string[][]> {
    const { tasks } = getRepositories();
    const projectTasks = await tasks.getByProjectId(projectId);

    const taskMap = new Map(projectTasks.map((t) => [t.id, t]));
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (taskId: string) => {
      if (inStack.has(taskId)) {
        const cycleStart = path.indexOf(taskId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), taskId]);
        }
        return;
      }
      if (visited.has(taskId)) return;

      visited.add(taskId);
      inStack.add(taskId);
      path.push(taskId);

      const task = taskMap.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (taskMap.has(depId)) {
            dfs(depId);
          }
        }
      }

      path.pop();
      inStack.delete(taskId);
    };

    for (const task of projectTasks) {
      if (!visited.has(task.id)) {
        dfs(task.id);
      }
    }

    return cycles;
  }

  /**
   * Set dependencies for a task. `dependencies` is the source of truth;
   * `blockedBy` only stores incomplete dependencies for the current task.
   */
  async setDependencies(taskId: string, dependencyIds: string[]): Promise<void> {
    const { tasks } = getRepositories();
    const task = await tasks.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const uniqueDependencyIds = Array.from(new Set(dependencyIds));
    if (uniqueDependencyIds.includes(taskId)) {
      throw new Error("Task cannot depend on itself");
    }

    await tasks.update(taskId, { dependencies: uniqueDependencyIds });

    if (task.projectId) {
      const cycles = await this.detectCycles(task.projectId);
      if (cycles.length > 0) {
        await tasks.update(taskId, { dependencies: task.dependencies, blockedBy: task.blockedBy });
        throw new Error(`Task dependency cycle detected: ${cycles[0]?.join(" -> ")}`);
      }
    }

    const blockedBy = await this.getIncompleteDependencies(taskId);
    if (blockedBy.length > 0) {
      await tasks.update(taskId, {
        status: "blocked",
        blockedBy,
      });

      emitWorkspaceEvent({
        type: "workspace.task.blocked",
        title: "Task blocked",
        summary: `${task.title} blocked by ${blockedBy.length} dependencies`,
        severity: "warning",
        workspaceId: task.workspaceId ?? "",
        projectId: task.projectId ?? undefined,
        taskId: task.id,
        payload: {
          workspaceId: task.workspaceId ?? "",
          projectId: task.projectId ?? "",
          taskId: task.id,
          taskTitle: task.title,
          blockedBy,
        },
      });
    } else if (task.status === "blocked") {
      await tasks.update(taskId, { status: "queued", blockedBy: [] });
    } else {
      await tasks.update(taskId, { blockedBy: [] });
    }
  }
}
