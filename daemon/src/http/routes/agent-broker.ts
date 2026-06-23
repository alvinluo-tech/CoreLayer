import { Hono } from "hono";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { proposeTeam } from "../../services/agent-broker.js";
import { generateText } from "ai";
import { getModelGateway } from "../../gateways/model/gateway.js";

const agentBrokerRoutes = new Hono();

const SPEC_SYSTEM_PROMPT = `You are a project planner. Given a user's goal, generate a concise project specification.

Return a JSON object with these fields:
- "summary": 2-3 sentence project summary
- "nonGoals": Array of 2-3 things explicitly NOT in scope
- "techStack": Comma-separated list of recommended technologies
- "constraints": Array of 2-3 key constraints or assumptions
- "milestones": Array of 3-4 milestone names

Return ONLY the JSON object, no other text.`;

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
 * POST /api/agent-broker/propose-team - Get agent team recommendation
 */
agentBrokerRoutes.post("/propose-team", async (c) => {
  try {
    const body = await c.req.json<{
      goal: string;
      requiredCapabilities?: string[];
      maxAgents?: number;
    }>();

    if (!body.goal) {
      return apiError(c, "goal is required", 400);
    }

    const proposal = proposeTeam({
      goal: body.goal,
      requiredCapabilities: body.requiredCapabilities,
      maxAgents: body.maxAgents,
    });

    let spec: Record<string, unknown>;
    try {
      const gateway = getModelGateway();
      const modelId = gateway.selectModel({ mode: "text" });
      const model = gateway.getModel(modelId);

      const result = await generateText({
        model,
        system: SPEC_SYSTEM_PROMPT,
        messages: [{ role: "user", content: body.goal }],
      });

      spec = parseSpecResponse(result.text);
    } catch (err) {
      logError("agent-broker/spec-gen-route", err);
      spec = {
        summary: body.goal.slice(0, 200),
        techStack: "TypeScript",
        nonGoals: [],
        constraints: [],
        milestones: [],
      };
    }

    return c.json({
      data: {
        agents: proposal.agents,
        warnings: proposal.warnings,
        spec,
      },
    });
  } catch (err) {
    logError("agent-broker/propose-team", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default agentBrokerRoutes;
