/**
 * Capability Grant Service — manages scoped permission packages.
 *
 * Default profiles define common permission sets for coding tasks.
 * Grants can be created from execution plans and are matched against actions.
 */

export type GrantProfile =
  | "read_only"
  | "workspace_write"
  | "coding_standard"
  | "dependency_install"
  | "network_read"
  | "network_write"
  | "git_remote_write"
  | "system_admin";

/** Default permission profiles */
export const GRANT_PROFILES: Record<GrantProfile, { actions: string[]; description: string }> = {
  read_only: {
    actions: ["file.read", "git.read"],
    description: "Read-only access to workspace files and git status",
  },
  workspace_write: {
    actions: ["file.read", "file.write", "git.read"],
    description: "Read and write files within workspace",
  },
  coding_standard: {
    actions: ["file.read", "file.write", "git.read", "shell.exec"],
    description: "Standard coding: read/write files, git, run test/lint/build",
  },
  dependency_install: {
    actions: ["file.read", "file.write", "shell.exec"],
    description: "Install dependencies via package managers",
  },
  network_read: {
    actions: ["file.read", "network.request"],
    description: "Read files and make network requests",
  },
  network_write: {
    actions: ["file.read", "file.write", "network.request"],
    description: "Read/write files and make network requests",
  },
  git_remote_write: {
    actions: ["file.read", "file.write", "git.read", "git.write"],
    description: "Full git access including push/fetch/pull",
  },
  system_admin: {
    actions: ["file.read", "file.write", "file.delete", "shell.exec", "network.request", "git.read", "git.write"],
    description: "Full system access (use with caution)",
  },
};

/**
 * Generate a permission package from an execution plan.
 */
export function generatePermissionPackage(input: {
  goal: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  expectedActions: string[];
  forbiddenActions?: string[];
}): {
  requestedProfiles: GrantProfile[];
  humanPreview: string;
} {
  const { expectedActions, forbiddenActions = [] } = input;

  // Find the minimal profile that covers all expected actions
  const profiles = Object.entries(GRANT_PROFILES) as [GrantProfile, (typeof GRANT_PROFILES)[GrantProfile]][];

  const requestedProfiles: GrantProfile[] = [];

  for (const [profileName, profile] of profiles) {
    const coversAll = expectedActions.every((action) => profile.actions.includes(action));
    const hasNoForbidden = forbiddenActions.every((action) => !profile.actions.includes(action));

    if (coversAll && hasNoForbidden) {
      requestedProfiles.push(profileName);
    }
  }

  // If no single profile covers everything, use the broadest needed
  if (requestedProfiles.length === 0) {
    // Fall back to coding_standard if it covers most
    const codingStandard = GRANT_PROFILES.coding_standard;
    const coversMost = expectedActions.filter((a) => codingStandard.actions.includes(a)).length >= expectedActions.length * 0.5;
    if (coversMost) {
      requestedProfiles.push("coding_standard");
    }
  }

  const humanPreview = [
    `Goal: ${input.goal}`,
    `Required actions: ${expectedActions.join(", ")}`,
    forbiddenActions.length > 0 ? `Forbidden: ${forbiddenActions.join(", ")}` : null,
    `Profiles: ${requestedProfiles.map((p) => `${p} (${GRANT_PROFILES[p].description})`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { requestedProfiles, humanPreview };
}
