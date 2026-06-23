/**
 * Team Mode Orchestrator — structured task graph for multi-agent workflows.
 *
 * Instead of free-form multi-agent chat, team mode uses a task graph
 * with defined roles: planner, builder, reviewer, tester.
 */

import type { AgentRole, AgentSpec, TeamSpec } from "./agent-spec.js";

/** Task assignment to an agent */
export interface TaskAssignment {
  taskId: string;
  agentId: string;
  role: AgentRole;
  taskType: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

/** Team workflow state */
export interface TeamWorkflow {
  teamId: string;
  assignments: TaskAssignment[];
  currentPhase: "planning" | "building" | "reviewing" | "testing" | "delivering";
}

/**
 * Assign agents to tasks based on team spec and agent capabilities.
 */
export function assignTasks(
  teamSpec: TeamSpec,
  tasks: Array<{ id: string; type: string }>,
  agents: AgentSpec[],
): TaskAssignment[] {
  const assignments: TaskAssignment[] = [];

  for (const task of tasks) {
    // Find team agent for this task type
    const teamAgent = teamSpec.agents.find(
      (ta) => ta.taskTypes.includes(task.type) || ta.taskTypes.includes("*"),
    );

    if (teamAgent) {
      const agent = agents.find((a) => a.id === teamAgent.agentId);
      if (agent) {
        assignments.push({
          taskId: task.id,
          agentId: agent.id,
          role: teamAgent.role,
          taskType: task.type,
          status: "pending",
        });
      }
    }
  }

  return assignments;
}

/**
 * Determine if a task needs review after builder completion.
 */
export function needsReview(teamSpec: TeamSpec, taskType: string): boolean {
  if (!teamSpec.workflow.requireReview) return false;
  const teamAgent = teamSpec.agents.find(
    (ta) => ta.taskTypes.includes(taskType) || ta.taskTypes.includes("*"),
  );
  return teamAgent?.role === "builder";
}

/**
 * Get the next phase in the workflow.
 */
export function getNextPhase(current: TeamWorkflow["currentPhase"]): TeamWorkflow["currentPhase"] {
  const phases: TeamWorkflow["currentPhase"][] = ["planning", "building", "reviewing", "testing", "delivering"];
  const idx = phases.indexOf(current);
  return phases[Math.min(idx + 1, phases.length - 1)];
}
