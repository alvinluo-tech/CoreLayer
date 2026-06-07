import { getRepositories } from "../../../persistence/factory.js";
import type { GoalRow, GoalRepository } from "../../../persistence/repository.js";

export interface GoalCommandResult {
  handled: boolean;
  reply: string;
}

/** Minimum answer length (chars) to skip auto-continuation check. */
const MIN_ANSWER_LENGTH_FOR_NO_CHECK = 200;

export function isGoalCommand(message: string): boolean {
  return message.trim().startsWith("/goal");
}

export async function handleGoalCommand(raw: string): Promise<GoalCommandResult> {
  const repo = getRepositories().goals;
  const parts = raw.trim().split(/\s+/);
  const sub = parts[1]?.toLowerCase() ?? "help";

  switch (sub) {
    case "status": {
      const goals = await repo.list();
      if (goals.length === 0) {
        return { handled: true, reply: "目前没有设定任何目标。使用 `/goal <描述>` 来创建一个。" };
      }
      const lines = goals.map((g) => {
        const progress = g.progress ? ` (${JSON.stringify(g.progress)})` : "";
        return `- [${g.status}] ${g.description}${progress} (ID: ${g.id.slice(0, 8)})`;
      });
      return { handled: true, reply: `**当前目标：**\n${lines.join("\n")}` };
    }

    case "pause": {
      const goal = await findLatestGoal(repo, parts[2]);
      if (!goal) return { handled: true, reply: "未找到可暂停的活跃目标。" };
      await repo.update(goal.id, { status: "paused" });
      return { handled: true, reply: `已暂停目标：${goal.description}` };
    }

    case "resume": {
      const goal = await findLatestGoal(repo, parts[2], ["paused"]);
      if (!goal) return { handled: true, reply: "未找到可恢复的暂停目标。" };
      await repo.update(goal.id, { status: "active" });
      return { handled: true, reply: `已恢复目标：${goal.description}` };
    }

    case "complete": {
      const goal = await findLatestGoal(repo, parts[2]);
      if (!goal) return { handled: true, reply: "未找到可完成的目标。" };
      await repo.update(goal.id, { status: "completed" });
      return { handled: true, reply: `已标记完成：${goal.description}` };
    }

    case "abandon": {
      const goal = await findLatestGoal(repo, parts[2]);
      if (!goal) return { handled: true, reply: "未找到可放弃的目标。" };
      await repo.update(goal.id, { status: "abandoned" });
      return { handled: true, reply: `已放弃目标：${goal.description}` };
    }

    case "progress": {
      const pct = parseInt(parts[2] ?? "", 10);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return { handled: true, reply: "请指定百分比：/goal progress <0-100>" };
      }
      const goal = await findLatestGoal(repo, parts[3]);
      if (!goal) return { handled: true, reply: "未找到活跃目标。" };
      await repo.update(goal.id, { progress: { pct } });
      return { handled: true, reply: `已更新进度：${goal.description} → ${pct}%` };
    }

    case "delete": {
      const goal = await findLatestGoal(repo, parts[2]);
      if (!goal) return { handled: true, reply: "未找到可删除的目标。" };
      await repo.delete(goal.id);
      return { handled: true, reply: `已删除目标：${goal.description}` };
    }

    case "help":
      return {
        handled: true,
        reply: [
          "**目标命令：**",
          "- `/goal <描述>` — 创建新目标",
          "- `/goal status` — 查看所有目标",
          "- `/goal pause [ID]` — 暂停目标",
          "- `/goal resume [ID]` — 恢复目标",
          "- `/goal complete [ID]` — 标记完成",
          "- `/goal abandon [ID]` — 放弃目标",
          "- `/goal progress <0-100>` — 更新进度",
          "- `/goal delete [ID]` — 删除目标",
        ].join("\n"),
      };

    default: {
      // Default: create a goal with the full text after /goal
      const description = parts.slice(1).join(" ").trim();
      if (!description) {
        return { handled: true, reply: "请提供目标描述：/goal <描述>" };
      }
      const goal = await repo.create({ description });
      return { handled: true, reply: `已创建目标：${goal.description} (ID: ${goal.id.slice(0, 8)})` };
    }
  }
}

async function findLatestGoal(
  repo: GoalRepository,
  id?: string,
  statuses?: string[],
): Promise<GoalRow | null> {
  if (id) {
    const goal = await repo.getById(id);
    if (goal && (!statuses || statuses.includes(goal.status))) return goal;
    return null;
  }
  const goals = statuses
    ? (await repo.list()).filter((g: GoalRow) => statuses.includes(g.status))
    : await repo.getActive();
  return goals.length > 0 ? goals[goals.length - 1] : null;
}

/**
 * Lightweight judge that checks after each turn whether active goals
 * need continuation. No LLM call — uses heuristic: if answer is short
 * and there are active goals, suggest continuation.
 */
export class GoalJudge {
  async checkAfterTurn(assistantText: string): Promise<{
    needsContinuation: boolean;
    continuationPrompt?: string;
  }> {
    if (assistantText.length >= MIN_ANSWER_LENGTH_FOR_NO_CHECK) {
      return { needsContinuation: false };
    }

    const repo = getRepositories().goals;
    const activeGoals = await repo.getActive();
    if (activeGoals.length === 0) {
      return { needsContinuation: false };
    }

    const goalDescriptions = activeGoals.map((g) => `- ${g.description}`).join("\n");
    return {
      needsContinuation: true,
      continuationPrompt: [
        "[系统提示] 用户有以下活跃目标尚未达成：",
        goalDescriptions,
        "请检查刚才的回答是否已经充分推进了这些目标。如果还没有，请继续深入回答以帮助用户达成目标。",
      ].join("\n"),
    };
  }
}
