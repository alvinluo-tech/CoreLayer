/**
 * TaskDecomposer — AI-assisted task splitting.
 *
 * Takes a high-level objective and breaks it down into sub-tasks
 * with dependencies and acceptance criteria.
 */

import { generateText } from "ai";
import { getModelGateway } from "../model/gateway.js";
import { getRepositories } from "../db/factory.js";
import { logError } from "../utils/errors.js";

export interface TaskDraft {
  title: string;
  description: string;
  objective: string;
  priority: number;
  dependencies: number[]; // indices into the drafts array
  acceptanceCriteria: string[];
}

export interface DecomposeResult {
  parentTaskId: string;
  subtasks: {
    id: string;
    title: string;
  }[];
}

const DECOMPOSE_SYSTEM_PROMPT = `You are a task decomposition assistant. Given a high-level task objective, break it down into concrete, executable sub-tasks.

Return a JSON array of sub-tasks. Each sub-task must have:
- "title": Short action-oriented title
- "description": What needs to be done
- "objective": The specific goal of this sub-task
- "priority": 1-5 (1=highest)
- "dependencies": Array of indices (0-based) of sub-tasks that must complete before this one can start
- "acceptanceCriteria": Array of strings describing how to verify completion

Rules:
- Keep the number of sub-tasks between 2 and 8
- Dependencies must reference earlier sub-tasks (lower indices)
- No circular dependencies
- Each sub-task should be completable in one agent run
- Focus on concrete, verifiable outcomes
- Return ONLY the JSON array, no other text`;

/**
 * Decompose a task objective into sub-tasks using AI.
 */
export async function decomposeTask(
  objective: string,
  _projectId: string,
  agentId?: string,
): Promise<DecomposeResult> {
  const { tasks } = getRepositories();

  // Create the parent task
  const parentTask = await tasks.create({
    title: objective.length > 80 ? objective.slice(0, 77) + "..." : objective,
    description: objective,
    objective,
    priority: 2,
    assignedAgentId: agentId,
  });

  try {
    const gateway = getModelGateway();
    const modelId = gateway.selectModel({ mode: "text" });
    const model = gateway.getModel(modelId);

    const result = await generateText({
      model,
      system: DECOMPOSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: objective }],
    });

    // Parse the AI response
    let drafts: TaskDraft[];
    try {
      // Try to extract JSON from the response (may be wrapped in markdown)
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      drafts = JSON.parse(jsonMatch[0]) as TaskDraft[];
    } catch (parseErr) {
      logError("decomposeTask/parse", parseErr);
      // Fall back to a single sub-task
      drafts = [
        {
          title: objective.length > 80 ? objective.slice(0, 77) + "..." : objective,
          description: objective,
          objective,
          priority: 2,
          dependencies: [],
          acceptanceCriteria: [],
        },
      ];
    }

    // Create sub-tasks and build index mapping
    const createdTasks: { id: string; title: string }[] = [];
    const indexToId: Map<number, string> = new Map();

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i]!;
      // Resolve dependency indices to actual task IDs
      const resolvedDeps = draft.dependencies
        .filter((idx) => idx < i && indexToId.has(idx))
        .map((idx) => indexToId.get(idx)!);

      const subtask = await tasks.create({
        title: draft.title,
        description: draft.description,
        objective: draft.objective,
        priority: draft.priority,
        parentTaskId: parentTask.id,
        dependencies: resolvedDeps,
        acceptanceCriteria: draft.acceptanceCriteria,
        assignedAgentId: agentId,
      });

      indexToId.set(i, subtask.id);
      createdTasks.push({ id: subtask.id, title: subtask.title });
    }

    return {
      parentTaskId: parentTask.id,
      subtasks: createdTasks,
    };
  } catch (err) {
    logError("decomposeTask", err);
    // If AI fails, create a single sub-task as fallback
    const fallback = await tasks.create({
      title: parentTask.title,
      description: parentTask.description ?? objective,
      objective: parentTask.objective ?? objective,
      priority: parentTask.priority,
      parentTaskId: parentTask.id,
    });

    return {
      parentTaskId: parentTask.id,
      subtasks: [{ id: fallback.id, title: fallback.title }],
    };
  }
}
