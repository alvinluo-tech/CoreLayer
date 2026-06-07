import { z } from 'zod';

// ---- ApprovalRequest ----

export const approvalStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired']);
export const approvalRiskSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const approvalRequestSchema = z.object({
  id: z.string(),
  runId: z.string(),
  toolId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
  risk: z.string(),
  status: approvalStatusSchema,
  projectScope: z.boolean(),
  decidedAt: z.number().nullable(),
  createdAt: z.number(),
  mode: z.string().nullable(),
  source: z.string().nullable(),
  preview: z.string().nullable(),
  toolCallId: z.string().nullable(),
  expiresAt: z.number().nullable(),
});

export const approvalListResponseSchema = z.object({
  data: z.array(approvalRequestSchema),
});

// ---- AgentRun ----

export const runStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'waiting_for_approval',
]);
export const runModeSchema = z.enum([
  'chat',
  'voice',
  'tick',
  'scheduled',
  'workflow',
  'regenerate',
]);

export const agentRunSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  agentId: z.string().nullable(),
  userMessageId: z.string().nullable(),
  assistantMessageId: z.string().nullable(),
  status: runStatusSchema,
  mode: runModeSchema,
  selectedModel: z.string().nullable(),
  routeReason: z.string().nullable(),
  selectedTools: z.array(z.string()).nullable(),
  memoryReads: z.array(z.string()).nullable(),
  memoryWrites: z.array(z.string()).nullable(),
  toolCalls: z.array(z.unknown()).nullable(),
  toolCallCount: z.number().nullable(),
  artifacts: z.array(z.unknown()).nullable(),
  approvals: z.array(z.unknown()).nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
});

export const runListResponseSchema = z.object({
  data: z.array(agentRunSchema),
});

// ---- AgentRunEvent ----

export const agentRunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sequence: z.number(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});

export const runEventsResponseSchema = z.object({
  data: z.array(agentRunEventSchema),
});

// ---- Memory ----

export const memoryScopeTypeSchema = z.enum([
  'user',
  'workspace',
  'project',
  'agent',
  'task',
  'conversation',
]);
export const memoryTypeSchema = z.enum(['fact', 'preference', 'context', 'summary']);
export const memoryTierSchema = z.enum(['preference', 'context', 'fact']);

export const memorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  scopeType: memoryScopeTypeSchema,
  scopeId: z.string().nullable(),
  type: memoryTypeSchema,
  tier: memoryTierSchema,
  key: z.string(),
  value: z.string(),
  source: z.string().nullable(),
  confidence: z.number().nullable(),
  uses: z.number(),
  lastInjectedAt: z.string().nullable(),
  sourceRunId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const memoryListResponseSchema = z.object({
  data: z.array(memorySchema),
});

// ---- AgentProfile ----

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  modelPolicy: z.unknown(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  knowledgeScopes: z.array(z.string()),
  permissions: z.array(z.string()),
  memoryScopes: z.array(z.string()),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const agentProfileListResponseSchema = z.object({
  data: z.array(agentProfileSchema),
});

// ---- Infer TypeScript types from schemas ----

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type ApprovalRisk = z.infer<typeof approvalRiskSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunMode = z.infer<typeof runModeSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentRunEvent = z.infer<typeof agentRunEventSchema>;

export type MemoryScopeType = z.infer<typeof memoryScopeTypeSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryTier = z.infer<typeof memoryTierSchema>;
export type Memory = z.infer<typeof memorySchema>;

export type AgentProfile = z.infer<typeof agentProfileSchema>;
