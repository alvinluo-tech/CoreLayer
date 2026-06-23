export type AutonomyMode = "conservative" | "builder" | "full";

export interface ExecutionPolicy {
  mode: AutonomyMode;
  allowLowRiskContinuation: boolean;
  allowDependencyInstall: boolean;
  allowDestructiveActions: boolean;
  allowCredentialEntry: boolean;
}

export type InteractionKind =
  | "confirmation"
  | "dependency_install"
  | "credential"
  | "destructive"
  | "selection"
  | "unknown";

export type InteractionDecision =
  | {
      action: "none";
      kind?: undefined;
      reason?: undefined;
      response?: undefined;
    }
  | {
      action: "respond";
      kind: InteractionKind;
      reason: string;
      response: string;
    }
  | {
      action: "block";
      kind: InteractionKind;
      reason: string;
      response?: undefined;
    };

const CREDENTIAL_PATTERNS = [
  /\b(api[_ -]?key|token|password|passphrase|secret)\b/i,
  /\blogin required\b/i,
  /\bplease log in\b/i,
  /\bauthentication required\b/i,
];

const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b.*\b(directory|folder|all contents|recursively)\b/i,
  /\bremove\b.*\b(directory|folder|all contents|recursively)\b/i,
  /\brm\s+-rf\b/i,
  /\boverwrite\b.*\bwithout backup\b/i,
];

const INSTALL_PATTERNS = [
  /\binstall\b.*\b(dependencies|packages|missing packages)\b/i,
  /\bmissing\b.*\bdependencies\b/i,
];

const CONTINUE_PATTERNS = [
  /\bdo you want to continue\b/i,
  /\bcontinue\?\s*(\[[yYnN/]+\])?/i,
  /\bpress enter\b/i,
  /\bproceed\?\s*(\[[yYnN/]+\])?/i,
];

const SELECTION_PATTERNS = [
  /\bselect an option\b/i,
  /\buse arrow keys\b/i,
  /\bchoose one\b/i,
];

export function createDefaultExecutionPolicy(mode: AutonomyMode = "builder"): ExecutionPolicy {
  return {
    mode,
    allowLowRiskContinuation: mode === "builder" || mode === "full",
    allowDependencyInstall: mode === "builder" || mode === "full",
    allowDestructiveActions: false,
    allowCredentialEntry: false,
  };
}

export function classifyInteraction(output: string): InteractionKind | null {
  const text = output.trim();
  if (!text) return null;

  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) return "credential";
  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(text))) return "destructive";
  if (INSTALL_PATTERNS.some((pattern) => pattern.test(text))) return "dependency_install";
  if (SELECTION_PATTERNS.some((pattern) => pattern.test(text))) return "selection";
  if (CONTINUE_PATTERNS.some((pattern) => pattern.test(text))) return "confirmation";

  return null;
}

export function evaluateInteraction(
  output: string,
  policy: ExecutionPolicy,
): InteractionDecision {
  const kind = classifyInteraction(output);
  if (!kind) return { action: "none" };

  if (kind === "credential") {
    return {
      action: "block",
      kind,
      reason: "Credential or login prompt requires external setup",
    };
  }

  if (kind === "destructive") {
    return {
      action: "block",
      kind,
      reason: "Destructive filesystem prompt is outside autonomous policy",
    };
  }

  if (kind === "dependency_install" && policy.allowDependencyInstall) {
    return {
      action: "respond",
      response: "y\n",
      reason: "Dependency installation is allowed by execution policy",
      kind,
    };
  }

  if (kind === "confirmation" && policy.allowLowRiskContinuation) {
    return {
      action: "respond",
      response: "y\n",
      reason: "Low-risk continuation prompt",
      kind,
    };
  }

  return {
    action: "block",
    kind,
    reason: `Interaction requires input not allowed by ${policy.mode} policy`,
  };
}
