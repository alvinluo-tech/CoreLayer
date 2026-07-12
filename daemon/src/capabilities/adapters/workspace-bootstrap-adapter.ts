import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { allowGitRoot, execGit } from "./git-command-adapter.js";

export async function initializeWorkspaceRepository(input: {
  workspaceRoot: string;
  projectRoot: string;
  projectName: string;
  goal: string;
}): Promise<void> {
  const workspaceRoot = resolve(input.workspaceRoot);
  const projectRoot = resolve(input.projectRoot);
  if (projectRoot !== workspaceRoot && !projectRoot.startsWith(`${workspaceRoot}${sep}`)) {
    throw new Error(`Workspace bootstrap path escapes configured root: ${projectRoot}`);
  }

  mkdirSync(projectRoot, { recursive: true });
  const readmePath = resolve(projectRoot, "README.md");
  if (!existsSync(readmePath)) {
    writeFileSync(
      readmePath,
      `# ${input.projectName}\n\nGenerated from goal: ${input.goal}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
  }

  allowGitRoot(projectRoot);
  const context = { reason: "Initialize a Jarvis-managed workspace repository" };
  await execGit(["init"], projectRoot, "workspace-orchestrator", context);
  await execGit(["config", "user.name", "Jarvis Agent"], projectRoot, "workspace-orchestrator", context);
  await execGit(["config", "user.email", "agent@jarvis.local"], projectRoot, "workspace-orchestrator", context);
  await execGit(["add", "README.md"], projectRoot, "workspace-orchestrator", context);
  await execGit(["commit", "-m", "initial commit"], projectRoot, "workspace-orchestrator", context);
}
