/**
 * Runtime context resolver.
 *
 * Centralizes workspace/agent default creation and context resolution
 * so API routes, scheduler, and task execution share the same logic.
 */

import { getRepositories } from "../db/factory.js";

export interface RunContext {
  workspaceId: string;
  projectId?: string;
  agentId: string;
}

/**
 * Resolve workspace and agent context from partial input.
 * Creates default workspace/agent if they don't exist.
 *
 * @param input - Partial context from request (workspaceId, projectId, agentId)
 * @returns Resolved context with guaranteed workspaceId and agentId
 */
export async function resolveRunContext(input: {
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
}): Promise<RunContext> {
  const repos = getRepositories();

  // Resolve workspace
  let workspaceId = input.workspaceId;
  if (!workspaceId) {
    let workspace = await repos.workspaces.getDefault("default");
    if (!workspace) {
      workspace = await repos.workspaces.create({
        ownerId: "default",
        name: "Personal",
        description: "Default personal workspace",
      });
    }
    workspaceId = workspace.id;
  }

  // Resolve agent
  let agentId = input.agentId;
  if (!agentId) {
    let agent = await repos.agentProfiles.getDefault();
    if (!agent) {
      agent = await repos.agentProfiles.create({
        name: "Jarvis",
        description: "Default personal assistant agent",
        isDefault: true,
      });
    }
    agentId = agent.id;
  }

  return {
    workspaceId,
    projectId: input.projectId,
    agentId,
  };
}
