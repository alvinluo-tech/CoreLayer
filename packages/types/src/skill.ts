import type { RiskLevel } from './tool.js';

export type SkillType = 'tool' | 'workflow' | 'ui' | 'scheduled';

export interface SkillTrigger {
  type: 'command' | 'schedule' | 'event';
  phrases?: string[];
  cron?: string;
  event?: string;
}

export interface SkillToolDefinition {
  name: string;
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  type: SkillType;
  permissions: string[];
  tools: SkillToolDefinition[];
  triggers: SkillTrigger[];
  enabled: boolean;
}

export interface SkillExecutionContext {
  skillId: string;
  toolName: string;
  args: unknown;
  userId?: string;
}

export interface SkillExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}
