/**
 * WorkspaceOrchestrator — the main pipeline for goal → workspace → spec → team → tasks → runs.
 *
 * POST /api/workspaces/from-goal triggers this flow:
 * 1. Create workspace with goal
 * 2. Generate project spec via LLM
 * 3. Create project with spec/techStack
 * 4. Decompose tasks
 * 5. Select agents via broker
 * 6. Write workspace_agents
 * 7. Create artifacts
 * 8. Return full workspace state
 */

import { generateText } from "ai";
import { getModelGateway } from "../gateways/model/gateway.js";
import { getRepositories } from "../persistence/factory.js";
import { db, schema } from "../persistence/client.js";
import { proposeTeam } from "./agent-broker.js";
import { enqueue } from "../workflow/queue-service.js";
import { logError } from "../shared/errors.js";
import { resolveAppPaths } from "../config/app-paths.js";
import { emitWorkspaceEvent } from "./workspace-event-emitter.js";
import * as fs from "node:fs";
import * as path from "node:path";

export interface OrchestratorResult {
  workspace: {
    id: string;
    name: string;
    goal: string;
    status: string;
  };
  project: {
    id: string;
    name: string;
    spec: string | null;
    techStack: string | null;
  };
  tasks: Array<{
    id: string;
    title: string;
    priority: number;
    dependencies: string[];
  }>;
  agents: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  artifacts: Array<{
    id: string;
    type: string;
    title: string;
  }>;
}

const SPEC_SYSTEM_PROMPT = `You are a project planner. Given a user's goal, generate a concise project specification.

Return a JSON object with these fields:
- "summary": 2-3 sentence project summary
- "nonGoals": Array of 2-3 things explicitly NOT in scope
- "techStack": Comma-separated list of recommended technologies
- "constraints": Array of 2-3 key constraints or assumptions
- "milestones": Array of 3-4 milestone names

Return ONLY the JSON object, no other text.`;

/**
 * Full orchestrator pipeline: goal → workspace → spec → team → tasks → artifacts.
 */
export async function orchestrateFromGoal(
  goal: string,
  options?: {
    spec?: {
      summary?: string;
      nonGoals?: string[];
      techStack?: string;
      constraints?: string[];
      milestones?: string[];
    };
    agentIds?: string[];
  }
): Promise<OrchestratorResult> {
  const { workspaces, projects, tasks, agentProfiles, eventLog } = getRepositories();

  // 1. Create workspace with goal, status = planning
  const workspace = await workspaces.create({
    name: goal.length > 60 ? goal.slice(0, 57) + "..." : goal,
    description: goal,
    ownerId: "default",
    goal,
    status: "planning",
  });

  emitWorkspaceEvent({
    type: "workspace.created",
    title: "Workspace created",
    summary: `Goal: ${goal.length > 80 ? goal.slice(0, 77) + "..." : goal}`,
    workspaceId: workspace.id,
    payload: { workspaceId: workspace.id, goal },
  });

  // 2. Generate project spec via LLM
  let spec: string | null = null;
  let techStack: string | null = null;

  if (options?.spec) {
    spec = JSON.stringify(options.spec, null, 2);
    techStack = typeof options.spec.techStack === "string" ? options.spec.techStack : (Array.isArray(options.spec.techStack) ? (options.spec.techStack as string[]).join(", ") : null);

    emitWorkspaceEvent({
      type: "workspace.spec.generated",
      title: "Spec provided",
      summary: `Tech stack: ${techStack ?? "not specified"}`,
      severity: "success",
      workspaceId: workspace.id,
      payload: { workspaceId: workspace.id, projectId: "", techStack },
    });
  } else {
    try {
      const gateway = getModelGateway();
      const modelId = gateway.selectModel({ mode: "text" });
      const model = gateway.getModel(modelId);

      const result = await generateText({
        model,
        system: SPEC_SYSTEM_PROMPT,
        messages: [{ role: "user", content: goal }],
      });

      const specJson = parseSpecResponse(result.text);
      spec = JSON.stringify(specJson, null, 2);
      techStack = typeof specJson.techStack === "string" ? specJson.techStack : (Array.isArray(specJson.techStack) ? specJson.techStack.join(", ") : null);

      emitWorkspaceEvent({
        type: "workspace.spec.generated",
        title: "Spec generated",
        summary: `Tech stack: ${techStack ?? "not specified"}`,
        severity: "success",
        workspaceId: workspace.id,
        payload: { workspaceId: workspace.id, projectId: "", techStack },
      });
    } catch (err) {
      logError("orchestrator/spec-gen", err);

      emitWorkspaceEvent({
        type: "workspace.spec.fallback",
        title: "Spec generation failed",
        summary: "Continuing without spec",
        severity: "warning",
        workspaceId: workspace.id,
        payload: { workspaceId: workspace.id, projectId: "", reason: err instanceof Error ? err.message : "Unknown error" },
      });
      // Continue without spec — non-blocking
    }
  }

  // Create physical workspace directory for agent runs
  const { appDataDir } = resolveAppPaths();
  const projectRootPath = path.join(appDataDir, "workspaces", workspace.id);
  const projectName = goal.length > 40 ? goal.slice(0, 37) + "..." : goal;

  try {
    const { execSync } = await import("node:child_process");
    fs.mkdirSync(projectRootPath, { recursive: true });
    // Initialize git repository
    execSync("git init", { cwd: projectRootPath, stdio: "ignore" });
    // Create initial README.md
    fs.writeFileSync(
      path.join(projectRootPath, "README.md"),
      `# ${projectName}\n\nGenerated from goal: ${goal}\n`
    );
    // Configure local git and add commit
    execSync("git config user.name \"Jarvis Agent\"", { cwd: projectRootPath, stdio: "ignore" });
    execSync("git config user.email \"agent@jarvis.local\"", { cwd: projectRootPath, stdio: "ignore" });
    execSync("git add . && git commit -m \"initial commit\"", { cwd: projectRootPath, stdio: "ignore" });
  } catch (err) {
    logError("orchestrator/workspace-dir-init", err);
  }

  // 3. Create project with spec and rootPath
  const project = await projects.create({
    workspaceId: workspace.id,
    name: projectName,
    description: goal,
    spec: spec ?? undefined,
    techStack: techStack ?? undefined,
    rootPath: projectRootPath,
  });

  // Set active project on workspace
  await workspaces.update(workspace.id, { activeProjectId: project.id });

  emitWorkspaceEvent({
    type: "workspace.project.created",
    title: "Project created",
    summary: project.name,
    workspaceId: workspace.id,
    projectId: project.id,
    payload: {
      workspaceId: workspace.id,
      projectId: project.id,
      projectName: project.name,
      rootPath: projectRootPath,
    },
  });

  // 4. Decompose tasks using LLM
  const createdTasks = await decomposeTasksForWorkspace(goal, project.id, workspace.id);

  emitWorkspaceEvent({
    type: "workspace.tasks.decomposed",
    title: "Tasks decomposed",
    summary: `${createdTasks.length} tasks, ${createdTasks.reduce((sum, t) => sum + t.dependencies.length, 0)} dependencies`,
    workspaceId: workspace.id,
    projectId: project.id,
    payload: {
      workspaceId: workspace.id,
      projectId: project.id,
      taskCount: createdTasks.length,
      dependencyCount: createdTasks.reduce((sum, t) => sum + t.dependencies.length, 0),
    },
  });

  // 5. Select agents via broker
  let agentIdsToAssign: string[] = [];
  if (options?.agentIds) {
    agentIdsToAssign = options.agentIds;
  } else {
    const proposal = proposeTeam({ goal, maxAgents: 5 });
    agentIdsToAssign = proposal.agents.map((a) => a.id);
  }

  // 6. Write workspace_agents
  const selectedAgents: OrchestratorResult["agents"] = [];
  for (const agentId of agentIdsToAssign) {
    const profile = await agentProfiles.getById(agentId);
    if (!profile) continue;

    // Insert into workspace_agents table
    const { db, schema } = await import("../persistence/client.js");
    const { eq, and } = await import("drizzle-orm");

    // Map agent profile role to workspace role
    const workspaceRole = mapProfileRoleToWorkspaceRole(profile.role);

    // Check if already added
    const existing = db
      .select()
      .from(schema.workspaceAgents)
      .where(
        and(
          eq(schema.workspaceAgents.workspaceId, workspace.id),
          eq(schema.workspaceAgents.agentProfileId, agentId)
        )
      )
      .get();

    if (!existing) {
      await db.insert(schema.workspaceAgents).values({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        agentProfileId: agentId,
        roleInWorkspace: workspaceRole,
        status: "idle",
      });
    }

    selectedAgents.push({ id: profile.id, name: profile.name, role: profile.role });
  }

  emitWorkspaceEvent({
    type: "workspace.team.assigned",
    title: "Team assigned",
    summary: `${selectedAgents.length} agents: ${selectedAgents.map((a) => a.role).join(", ")}`,
    workspaceId: workspace.id,
    payload: {
      workspaceId: workspace.id,
      agentCount: selectedAgents.length,
      roles: selectedAgents.map((a) => a.role),
    },
  });

  // 7. Create artifacts (spec + plan)
  const createdArtifacts: OrchestratorResult["artifacts"] = [];

  if (spec) {
    const specArtifact = await createArtifact({
      workspaceId: workspace.id,
      projectId: project.id,
      type: "spec",
      title: "Project Specification",
      content: spec,
    });
    createdArtifacts.push(specArtifact);

    emitWorkspaceEvent({
      type: "workspace.artifact.created",
      title: "Spec artifact created",
      summary: "Project Specification",
      workspaceId: workspace.id,
      projectId: project.id,
      artifactId: specArtifact.id,
      payload: {
        workspaceId: workspace.id,
        projectId: project.id,
        artifactType: "spec",
        artifactIndex: 0,
      },
    });
  }

  // Create plan artifact from task list
  const planContent = createdTasks.map((t, i) =>
    `${i + 1}. [P${t.priority}] ${t.title} (deps: ${t.dependencies.length})`
  ).join("\n");

  const planArtifact = await createArtifact({
    workspaceId: workspace.id,
    projectId: project.id,
    type: "plan",
    title: "Task Plan",
    content: planContent,
  });
  createdArtifacts.push(planArtifact);

  emitWorkspaceEvent({
    type: "workspace.artifact.created",
    title: "Plan artifact created",
    summary: "Task Plan",
    workspaceId: workspace.id,
    projectId: project.id,
    artifactId: planArtifact.id,
    payload: {
      workspaceId: workspace.id,
      projectId: project.id,
      artifactType: "plan",
      artifactIndex: createdArtifacts.length - 1,
    },
  });

  // 8. Auto-enqueue tasks that have no dependencies (ready to execute)
  // Find the first available agent for execution (prefer coding/builder roles)
  const executorAgent = selectedAgents.find((a) => a.role === "coding" || a.role === "builder") ?? selectedAgents[0];

  const enqueuedRunIds: string[] = [];
  for (const task of createdTasks) {
    // Tasks with no dependencies are immediately executable
    if (task.dependencies.length === 0) {
      try {
        // Update task status to queued and assign agent
        await tasks.update(task.id, {
          status: "queued",
          assignedAgentId: executorAgent?.id,
        });

        const entry = await enqueue({
          taskId: task.id,
          agentId: executorAgent?.id,
          workspaceId: workspace.id,
          projectId: project.id,
          mode: "workflow",
        });
        enqueuedRunIds.push(entry.runId);

        emitWorkspaceEvent({
          type: "workspace.task.queued",
          title: "Task queued",
          summary: task.title,
          workspaceId: workspace.id,
          projectId: project.id,
          taskId: task.id,
          payload: {
            workspaceId: workspace.id,
            projectId: project.id,
            taskId: task.id,
            taskTitle: task.title,
            assignedAgentId: executorAgent?.id,
          },
        });
      } catch (err) {
        logError("orchestrator/enqueue", err);
      }
    }
  }

  // 9. Log orchestration event
  await eventLog.create({
    type: "workspace.orchestrated",
    projectId: project.id,
    payload: {
      workspaceId: workspace.id,
      taskCount: createdTasks.length,
      agentCount: selectedAgents.length,
      hasSpec: !!spec,
      enqueuedRuns: enqueuedRunIds.length,
    },
  });

  // 10. Update workspace status to running
  await workspaces.update(workspace.id, { status: "running" });

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      goal: workspace.goal ?? goal,
      status: "running",
    },
    project: {
      id: project.id,
      name: project.name,
      spec,
      techStack,
    },
    tasks: createdTasks,
    agents: selectedAgents,
    artifacts: createdArtifacts,
  };
}

/**
 * Parse LLM spec response, with fallback for malformed output.
 */
function parseSpecResponse(text: string): Record<string, unknown> {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { summary: text.slice(0, 200), techStack: "TypeScript", nonGoals: [], constraints: [], milestones: [] };
    }
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { summary: text.slice(0, 200), techStack: "TypeScript", nonGoals: [], constraints: [], milestones: [] };
  }
}

/**
 * Decompose a goal into tasks for a specific workspace/project.
 * Reuses the LLM decomposer pattern but writes workspaceId/projectId.
 */
async function decomposeTasksForWorkspace(
  objective: string,
  projectId: string,
  workspaceId: string,
): Promise<OrchestratorResult["tasks"]> {
  const { tasks: taskRepo } = getRepositories();

  const DECOMPOSE_PROMPT = `You are a task decomposition assistant. Given a high-level objective, break it down into concrete, executable sub-tasks.

Return a JSON array of sub-tasks. Each sub-task must have:
- "title": Short action-oriented title
- "description": What needs to be done
- "objective": The specific goal of this sub-task
- "priority": 1-5 (1=highest)
- "dependencies": Array of indices (0-based) of sub-tasks that must complete first
- "acceptanceCriteria": Array of strings describing how to verify completion

Rules:
- 3 to 6 sub-tasks
- Dependencies must reference earlier sub-tasks (lower indices)
- No circular dependencies
- Each sub-task should be completable in one agent run
- Return ONLY the JSON array, no other text`;

  let drafts: Array<{
    title: string;
    description: string;
    objective: string;
    priority: number;
    dependencies: number[];
    acceptanceCriteria: string[];
  }> = [];

  try {
    const gateway = getModelGateway();
    const modelId = gateway.selectModel({ mode: "text" });
    const model = gateway.getModel(modelId);

    const result = await generateText({
      model,
      system: DECOMPOSE_PROMPT,
      messages: [{ role: "user", content: objective }],
    });

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      drafts = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    logError("orchestrator/decompose", err);
  }

  // Fallback if LLM failed
  if (drafts.length === 0) {
    drafts = [{
      title: objective.length > 80 ? objective.slice(0, 77) + "..." : objective,
      description: objective,
      objective,
      priority: 2,
      dependencies: [],
      acceptanceCriteria: [],
    }];
  }

  // Create tasks with workspaceId/projectId
  const createdTasks: OrchestratorResult["tasks"] = [];
  const indexToId: Map<number, string> = new Map();

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const resolvedDeps = draft.dependencies
      .filter((idx) => idx < i && indexToId.has(idx))
      .map((idx) => indexToId.get(idx)!);

    const task = await taskRepo.create({
      title: draft.title,
      description: draft.description,
      objective: draft.objective,
      priority: draft.priority,
      dependencies: resolvedDeps,
      acceptanceCriteria: draft.acceptanceCriteria,
      workspaceId,
      projectId,
    });

    indexToId.set(i, task.id);
    createdTasks.push({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dependencies: resolvedDeps,
    });
  }

  return createdTasks;
}

/**
 * Create an artifact record via direct Drizzle insert.
 */
async function createArtifact(input: {
  workspaceId: string;
  projectId: string;
  type: "spec" | "plan" | "file" | "report" | "scaffold";
  title: string;
  content: string;
}): Promise<{ id: string; type: string; title: string }> {
  const id = crypto.randomUUID();
  await db.insert(schema.artifacts).values({
    id,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    type: input.type,
    title: input.title,
    content: input.content,
  });
  return { id, type: input.type, title: input.title };
}

/**
 * Map agent profile role to workspace agent role.
 * Profile roles: general, planner, coding, review, testing, research
 * Workspace roles: owner, planner, builder, reviewer, tester, observer
 */
function mapProfileRoleToWorkspaceRole(
  profileRole: string,
): "owner" | "planner" | "builder" | "reviewer" | "tester" | "observer" {
  switch (profileRole) {
    case "planner": return "planner";
    case "coding": return "builder";
    case "review": return "reviewer";
    case "testing": return "tester";
    case "research": return "observer";
    default: return "builder";
  }
}
