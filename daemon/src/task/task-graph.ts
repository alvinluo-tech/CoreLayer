/**
 * TaskGraph — dependency resolution and execution tracking for the task graph.
 *
 * Responsibilities:
 * - Check if a task can execute (all dependencies completed)
 * - Get all executable tasks for a project
 * - Mark tasks complete and unblock dependents
 * - Detect circular dependencies
 */

import { getRepositories } from "../db/factory.js";
import type { TaskRow } from "../db/repository.js";

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
    return depTasks.every((dep) => {
      if (!dep) return false;
      const completedStatuses = ["completed", "done"];
      return completedStatuses.includes(dep.status);
    });
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
      const readyStatuses = ["queued", "pending"];
      if (!readyStatuses.includes(task.status)) continue;

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

    const completedStatuses = ["completed", "done"];
    if (completedStatuses.includes(task.status)) return;

    // Mark this task as completed
    await tasks.update(taskId, { status: "completed" });

    // Find tasks that have this task as a dependency
    const projectTasks = task.projectId
      ? await tasks.getByProjectId(task.projectId)
      : [];

    for (const dependent of projectTasks) {
      if (!dependent.dependencies.includes(taskId)) continue;

      // Remove this taskId from blocked_by
      const newBlockedBy = dependent.blockedBy.filter((id) => id !== taskId);

      // Check if all dependencies are now completed
      const allDepsComplete = await this.canExecute(dependent.id);

      if (allDepsComplete && dependent.status === "blocked") {
        // Unblock the task
        await tasks.update(dependent.id, {
          status: "queued",
          blockedBy: newBlockedBy,
        });
      } else if (newBlockedBy.length !== dependent.blockedBy.length) {
        await tasks.update(dependent.id, { blockedBy: newBlockedBy });
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
        // Found a cycle — extract it
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
   * Set dependencies for a task. Updates both the task's dependencies
   * and the blocked_by field on each dependency.
   */
  async setDependencies(taskId: string, dependencyIds: string[]): Promise<void> {
    const { tasks } = getRepositories();
    const task = await tasks.getById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    // Check for self-dependency
    if (dependencyIds.includes(taskId)) {
      throw new Error("Task cannot depend on itself");
    }

    // Check for cycles
    await tasks.update(taskId, { dependencies: dependencyIds });

    // Rebuild blocked_by for all dependency tasks
    const projectTasks = task.projectId
      ? await tasks.getByProjectId(task.projectId)
      : [];
    const taskMap = new Map(projectTasks.map((t) => [t.id, t]));

    // First, remove taskId from all old dependencies' blocked_by
    for (const depId of task.dependencies) {
      if (dependencyIds.includes(depId)) continue;
      const depTask = taskMap.get(depId) ?? await tasks.getById(depId);
      if (depTask) {
        const newBlockedBy = depTask.blockedBy.filter((id) => id !== taskId);
        await tasks.update(depId, { blockedBy: newBlockedBy });
      }
    }

    // Then, add taskId to new dependencies' blocked_by
    for (const depId of dependencyIds) {
      const depTask = taskMap.get(depId) ?? await tasks.getById(depId);
      if (depTask && !depTask.blockedBy.includes(taskId)) {
        await tasks.update(depId, {
          blockedBy: [...depTask.blockedBy, taskId],
        });
      }
    }

    // Determine initial status
    if (dependencyIds.length > 0) {
      const allComplete = await this.canExecute(taskId);
      if (!allComplete && task.status !== "blocked") {
        // Find which dependencies are incomplete
        const incompleteDeps: string[] = [];
        for (const depId of dependencyIds) {
          const dep = await tasks.getById(depId);
          if (dep && !["completed", "done"].includes(dep.status)) {
            incompleteDeps.push(depId);
          }
        }
        await tasks.update(taskId, {
          status: "blocked",
          blockedBy: incompleteDeps,
        });
      }
    } else if (task.status === "blocked" && task.dependencies.length > 0) {
      // Dependencies removed — unblock if was blocked
      await tasks.update(taskId, { status: "queued", blockedBy: [] });
    }
  }
}
