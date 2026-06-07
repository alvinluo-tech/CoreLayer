import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, schema } from "../../db/client.js";
import { getModelGateway } from "../../model/gateway.js";
import { apiError, logError } from "../../utils/errors.js";

const app = new Hono();

interface ModelUsageSummary {
  modelId: string;
  displayName: string;
  conversationCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface UsageSummary {
  totalConversations: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  models: ModelUsageSummary[];
}

function estimateCost(
  promptTokens: number,
  completionTokens: number,
  costPerMillion: { input: number; output: number },
): number {
  const inputCost = (promptTokens / 1_000_000) * costPerMillion.input;
  const outputCost = (completionTokens / 1_000_000) * costPerMillion.output;
  return Math.round((inputCost + outputCost) * 100) / 100;
}

app.get("/usage", (c) => {
  try {
    const gateway = getModelGateway();
    const rows = db
      .select({
        modelUsed: schema.conversations.modelUsed,
        conversationCount: sql<number>`count(*)`,
        totalPromptTokens: sql<number>`coalesce(sum(${schema.conversations.promptTokens}), 0)`,
        totalCompletionTokens: sql<number>`coalesce(sum(${schema.conversations.completionTokens}), 0)`,
      })
      .from(schema.conversations)
      .groupBy(schema.conversations.modelUsed)
      .all();

    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalCost = 0;

    const models: ModelUsageSummary[] = rows.map((row) => {
      const profile = gateway.getProfile(row.modelUsed);
      const costPerMillion = profile?.cost ?? { input: 0, output: 0 };
      const cost = estimateCost(row.totalPromptTokens, row.totalCompletionTokens, costPerMillion);

      totalPrompt += row.totalPromptTokens;
      totalCompletion += row.totalCompletionTokens;
      totalCost += cost;

      return {
        modelId: row.modelUsed,
        displayName: profile?.displayName ?? row.modelUsed,
        conversationCount: row.conversationCount,
        totalPromptTokens: row.totalPromptTokens,
        totalCompletionTokens: row.totalCompletionTokens,
        totalTokens: row.totalPromptTokens + row.totalCompletionTokens,
        estimatedCostUsd: cost,
      };
    });

    const totalConversations = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.conversations)
      .get()
      ?.count ?? 0;

    const summary: UsageSummary = {
      totalConversations,
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      estimatedCostUsd: totalCost,
      models,
    };

    return c.json(summary);
  } catch (err) {
    logError("settings/usage/get", err);
    return apiError(c, "Failed to get usage stats", 500);
  }
});

export default app;
