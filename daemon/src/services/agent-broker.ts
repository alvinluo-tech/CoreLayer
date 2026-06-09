import { db, schema } from "../persistence/client.js";
import { eq } from "drizzle-orm";

interface AgentTeamProposal {
  agents: Array<{
    id: string;
    name: string;
    role: string;
    reason: string;
    risk: "low" | "medium" | "high";
    permissions: string[];
  }>;
  warnings: string[];
}

interface TeamProposalInput {
  goal: string;
  requiredCapabilities?: string[];
  maxAgents?: number;
}

/**
 * Agent Broker: selects agents for a workspace based on role, capabilities, and enabled status.
 * Uses rule-based filtering (Phase 2). LLM-based ranking can be added later.
 */
export function proposeTeam(input: TeamProposalInput): AgentTeamProposal {
  const { goal, requiredCapabilities = [], maxAgents = 5 } = input;

  // Get all enabled agents
  const agents = db
    .select()
    .from(schema.agentProfiles)
    .where(eq(schema.agentProfiles.enabled, true))
    .all();

  const proposals: AgentTeamProposal["agents"] = [];
  const warnings: string[] = [];

  // Score agents based on role match and capabilities
  const scored = agents.map((agent) => {
    let score = 0;
    const capabilities = JSON.parse(agent.capabilities) as string[];
    const skills = JSON.parse(agent.skills) as string[];

    // Role-based scoring
    if (agent.role === "planner" && goal.toLowerCase().includes("plan")) score += 3;
    if (agent.role === "coding" && (goal.toLowerCase().includes("build") || goal.toLowerCase().includes("implement"))) score += 3;
    if (agent.role === "review" && goal.toLowerCase().includes("review")) score += 3;
    if (agent.role === "testing" && goal.toLowerCase().includes("test")) score += 3;

    // Capability matching
    for (const cap of requiredCapabilities) {
      if (capabilities.includes(cap)) score += 2;
      if (skills.includes(cap)) score += 1;
    }

    // Default agent gets a small boost
    if (agent.isDefault) score += 1;

    return { agent, score, capabilities, skills };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select top agents (at least 1, at most maxAgents)
  const selected = scored.slice(0, Math.max(1, Math.min(maxAgents, scored.length)));

  for (const { agent, capabilities } of selected) {
    const permissions = JSON.parse(agent.permissions) as string[];
    const risk: "low" | "medium" | "high" =
      permissions.includes("shell_exec") || permissions.includes("file_write")
        ? "medium"
        : permissions.length > 3
          ? "medium"
          : "low";

    // Generate reason based on role and capabilities
    let reason = `Selected as ${agent.role}`;
    if (capabilities.length > 0) {
      reason += ` with capabilities: ${capabilities.slice(0, 3).join(", ")}`;
    }
    if (agent.isDefault) {
      reason += " (default agent)";
    }

    proposals.push({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      reason,
      risk,
      permissions,
    });
  }

  // Generate warnings
  if (proposals.length === 0) {
    warnings.push("No agents available. Create agent profiles first.");
  }
  if (proposals.some((p) => p.risk === "high")) {
    warnings.push("Some agents have high-risk permissions. Review before confirming.");
  }
  if (proposals.length === 1) {
    warnings.push("Only one agent selected. Consider adding more for parallel execution.");
  }

  return { agents: proposals, warnings };
}
