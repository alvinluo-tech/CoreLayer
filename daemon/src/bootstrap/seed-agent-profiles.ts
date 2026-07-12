import { getRepositories } from "../persistence/factory.js";

export async function seedDefaultAgent(): Promise<void> {
  try {
    const repos = getRepositories();
    const allProfiles = await repos.agentProfiles.getAll();

    // 1. Seed general Default Agent if no default agent exists
    const hasDefault = allProfiles.some((p) => p.isDefault);
    if (!hasDefault) {
      await repos.agentProfiles.create({
        name: "Jarvis",
        description: "The default general-purpose agent with standard tools and skills.",
        isDefault: true,
        role: "general",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: [],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user"],
      });
      console.log("[Jarvis] Seeded default Jarvis agent profile");
    }

    // 2. Seed Planner Agent
    if (!allProfiles.some((p) => p.role === "planner")) {
      await repos.agentProfiles.create({
        name: "Planner Agent",
        description: "Analyzes requirements and designs specifications.",
        role: "planner",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["requirements_analysis", "architecture_design"],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user", "workspace"],
      });
      console.log("[Jarvis] Seeded Planner Agent profile");
    }

    // 3. Seed Coding Agent
    if (!allProfiles.some((p) => p.role === "coding")) {
      await repos.agentProfiles.create({
        name: "Coding Agent",
        description: "Writes high-quality code and implements features using Claude Code.",
        role: "coding",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "claude-code" },
        skills: ["code_implementation", "refactoring"],
        tools: [],
        permissions: ["chat", "task_management", "shell_exec", "file_write", "file_read"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Coding Agent profile");
    }

    // 4. Seed Testing Agent
    if (!allProfiles.some((p) => p.role === "testing")) {
      await repos.agentProfiles.create({
        name: "Testing Agent",
        description: "Writes unit and integration tests and runs test suites using Claude Code.",
        role: "testing",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "claude-code" },
        skills: ["test_implementation", "bug_verification"],
        tools: [],
        permissions: ["chat", "task_management", "shell_exec", "file_write", "file_read"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Testing Agent profile");
    }

    // 5. Seed Review Agent
    if (!allProfiles.some((p) => p.role === "review")) {
      await repos.agentProfiles.create({
        name: "Review Agent",
        description: "Reviews code changes and architectural consistency.",
        role: "review",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["code_review", "quality_audit"],
        tools: [],
        permissions: ["chat", "task_management"],
        memoryScopes: ["user", "workspace", "project"],
      });
      console.log("[Jarvis] Seeded Review Agent profile");
    }

    // 6. Seed Research Agent
    if (!allProfiles.some((p) => p.role === "research")) {
      await repos.agentProfiles.create({
        name: "Research Agent",
        description: "Researches technical details, libraries, and best practices.",
        role: "research",
        modelPolicy: { preferredModels: ["mimo-v2.5-pro"], fallbackModel: "mimo-v2.5" },
        executorPolicy: { executor: "self" },
        skills: ["technical_research", "web_search"],
        tools: [],
        permissions: ["chat", "task_management", "file_read"],
        memoryScopes: ["user", "workspace"],
      });
      console.log("[Jarvis] Seeded Research Agent profile");
    }
  } catch (err) {
    console.error("[Jarvis] Failed to seed agent profiles:", err);
  }
}
