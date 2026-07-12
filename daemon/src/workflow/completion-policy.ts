export interface CompletionPolicy {
  testCommands: string[];
  requiredArtifactTypes: string[];
  allowedPaths: string[];
  manualCriteria: string[];
}

/**
 * Compile human/task configuration into the small set of checks Jarvis can
 * enforce without pretending that free-form prose has been verified.
 */
export function parseCompletionPolicy(criteria: string[]): CompletionPolicy {
  const policy: CompletionPolicy = {
    testCommands: [],
    requiredArtifactTypes: [],
    allowedPaths: [],
    manualCriteria: [],
  };
  for (const raw of criteria) {
    const criterion = raw.trim();
    const separator = criterion.indexOf(":");
    const key = separator >= 0 ? criterion.slice(0, separator).trim().toLowerCase() : "";
    const value = separator >= 0 ? criterion.slice(separator + 1).trim() : "";
    if (key === "test" && value) policy.testCommands.push(value);
    else if (key === "artifact" && value) policy.requiredArtifactTypes.push(value);
    else if ((key === "allow-path" || key === "path") && value) policy.allowedPaths.push(value);
    else if (criterion) policy.manualCriteria.push(criterion);
  }
  return policy;
}
