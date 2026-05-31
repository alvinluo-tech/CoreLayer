import type {
  ModelRoutingRule,
  ModelTaskType,
  ModelProfile,
  CapabilityRequirements,
  ModelScore,
  ModelCapability,
} from '@jarvis/types';

interface TaskContext {
  mode?: 'text' | 'voice';
  expectedAnswerLength?: 'short' | 'medium' | 'long';
  requiresToolCalling?: boolean;
  requiresLongContext?: boolean;
  requiresPrivacy?: boolean;
  requiresVision?: boolean;
}

export function selectModelForTask(
  task: TaskContext,
  routingRules: ModelRoutingRule[],
  defaultModelId: string
): string {
  for (const rule of routingRules) {
    if (matchesRule(task, rule)) {
      return rule.modelId;
    }
  }
  return defaultModelId;
}

function matchesRule(task: TaskContext, rule: ModelRoutingRule): boolean {
  const conditions = rule.conditions;
  if (!conditions) return true;

  if (
    conditions.expectedAnswerLength &&
    task.expectedAnswerLength !== conditions.expectedAnswerLength
  ) {
    return false;
  }
  if (
    conditions.requiresToolCalling !== undefined &&
    task.requiresToolCalling !== conditions.requiresToolCalling
  ) {
    return false;
  }
  if (
    conditions.requiresLongContext !== undefined &&
    task.requiresLongContext !== conditions.requiresLongContext
  ) {
    return false;
  }
  if (
    conditions.requiresPrivacy !== undefined &&
    task.requiresPrivacy !== conditions.requiresPrivacy
  ) {
    return false;
  }
  if (
    conditions.requiresVision !== undefined &&
    task.requiresVision !== conditions.requiresVision
  ) {
    return false;
  }

  return true;
}

export function inferTaskType(task: TaskContext): ModelTaskType {
  if (task.mode === 'voice' && task.expectedAnswerLength === 'short') return 'fast';
  if (task.requiresToolCalling) return 'toolAgent';
  if (task.requiresLongContext) return 'reasoning';
  if (task.requiresPrivacy) return 'private';
  return 'chat';
}

export function selectModelByCapabilities(
  requirements: CapabilityRequirements,
  profiles: ModelProfile[],
  options?: { preferLowerCost?: boolean }
): ModelScore | null {
  let bestScore: ModelScore | null = null;

  for (const profile of profiles) {
    // Skip models that don't meet minimum context window
    if (
      requirements.minContextWindow &&
      profile.limits.contextWindow < requirements.minContextWindow
    ) {
      continue;
    }

    const matchedRequired: ModelCapability[] = [];
    for (const cap of requirements.required) {
      if (profile.capabilities[cap]) {
        matchedRequired.push(cap);
      }
    }

    // All required capabilities must match
    if (matchedRequired.length !== requirements.required.length) {
      continue;
    }

    const matchedBonus: ModelCapability[] = [];
    for (const cap of requirements.bonus ?? []) {
      if (profile.capabilities[cap]) {
        matchedBonus.push(cap);
      }
    }

    // Score: +10 per required match (all match by definition), +1 per bonus
    let score = matchedRequired.length * 10 + matchedBonus.length;

    // Context window factor: +1 for every 100k tokens
    score += Math.floor(profile.limits.contextWindow / 100_000);

    // Cost factor: lower cost = higher score (if preferLowerCost)
    if (options?.preferLowerCost) {
      const totalCost = profile.cost.input + profile.cost.output;
      score += totalCost === 0 ? 5 : Math.max(0, 5 - totalCost);
    }

    if (!bestScore || score > bestScore.score) {
      bestScore = {
        modelId: profile.id,
        score,
        matchedRequired,
        matchedBonus,
      };
    }
  }

  return bestScore;
}

export function selectModelForTaskWithFallback(
  task: TaskContext,
  routingRules: ModelRoutingRule[],
  defaultModelId: string,
  profiles?: ModelProfile[],
  requirements?: CapabilityRequirements
): string {
  // Primary: rule-based routing
  const ruleResult = selectModelForTask(task, routingRules, defaultModelId);
  if (ruleResult !== defaultModelId) {
    return ruleResult;
  }

  // Fallback: capability-based routing if profiles and requirements provided
  if (profiles && requirements) {
    const scored = selectModelByCapabilities(requirements, profiles);
    if (scored) {
      return scored.modelId;
    }
  }

  return defaultModelId;
}
