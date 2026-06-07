/**
 * Runtime context resolver.
 *
 * Centralizes workspace/agent default creation and context resolution
 * so API routes, scheduler, and task execution share the same logic.
 *
 * Scope resolution precedence:
 * 1. Existing conversation fields win for existing conversation turns.
 * 2. Defaults are used only when stored conversation fields are absent.
 * 3. Explicit request.projectId is preserved only for new conversations
 *    or when the existing conversation has no projectId.
 */

import { getRepositories } from "../../db/factory.js";

export interface RunContext {
  workspaceId: string;
  projectId?: string;
  agentId: string;
}

export interface ResolvedRunContext {
  conversationId?: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
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

/**
 * Resolve full runtime context from a request, using existing conversation
 * scope when available. Existing conversation fields always win over
 * request-level defaults for workspace/project/agent.
 *
 * @param request - Partial context from the request
 * @returns Resolved context with conversation scope applied
 */
export async function resolveConversationScope(request: {
  conversationId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
}): Promise<ResolvedRunContext> {
  const repos = getRepositories();
  let conversation = request.conversationId
    ? await repos.conversations.getById(request.conversationId)
    : null;

  // Resolve workspace: conversation wins, then request, then default
  let workspaceId = conversation?.workspaceId ?? request.workspaceId;
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

  // Resolve agent: conversation has no agentId field, so use request or default
  let agentId = request.agentId;
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

  // Resolve project: conversation wins if it has one, otherwise use request
  const projectId = conversation?.projectId ?? request.projectId;

  return {
    conversationId: request.conversationId,
    workspaceId,
    projectId: projectId ?? undefined,
    taskId: request.taskId,
    agentId,
  };
}
