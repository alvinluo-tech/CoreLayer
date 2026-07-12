import { getRepositories } from "../persistence/factory.js";
import { isTaskComplete, isTaskTerminal } from "./task-status.js";
import type { WorkspaceRow } from "../persistence/repository.js";

export async function reconcileWorkspaceStatus(
  workspaceId: string,
): Promise<WorkspaceRow["status"]> {
  const { tasks, workspaces, pendingActions } = getRepositories();
  const workspaceTasks = await tasks.getByWorkspaceId(workspaceId);
  const openActions = await pendingActions.getOpenByWorkspace(workspaceId);

  if (openActions.length > 0) {
    await workspaces.update(workspaceId, { status: "blocked" });
    return "blocked";
  }

  if (workspaceTasks.some((task) => task.manualInterventionRequired)) {
    await workspaces.update(workspaceId, { status: "blocked" });
    return "blocked";
  }

  if (workspaceTasks.length > 0 && workspaceTasks.every((task) => isTaskComplete(task.status))) {
    await workspaces.update(workspaceId, {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    return "succeeded";
  }

  if (
    workspaceTasks.length > 0 &&
    workspaceTasks.every((task) => isTaskTerminal(task.status)) &&
    workspaceTasks.some((task) => task.status === "failed")
  ) {
    await workspaces.update(workspaceId, { status: "failed" });
    return "failed";
  }

  return "running";
}
