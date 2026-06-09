import { Hono } from "hono";
import { apiError, extractErrorMessage, logError } from "../../shared/errors.js";
import { proposeTeam } from "../../services/agent-broker.js";

const agentBrokerRoutes = new Hono();

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

    return c.json({ data: proposal });
  } catch (err) {
    logError("agent-broker/propose-team", err);
    return apiError(c, extractErrorMessage(err), 500);
  }
});

export default agentBrokerRoutes;
