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
  'queued',
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

// ---- Coding Artifact ----

export const codingArtifactSchema = z.object({
  type: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const runArtifactsResponseSchema = z.object({
  data: z.array(codingArtifactSchema),
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

// ---- AgentModelPolicy ----

export const agentModelPolicySchema = z.object({
  preferredModels: z.array(z.string()).optional(),
  fallbackModel: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  provider: z.string().optional(),
});

export const agentExecutorPolicySchema = z.object({
  executor: z.enum(['self', 'codex', 'claude-code', 'opencode']),
  maxConcurrent: z.number().optional(),
  workDir: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

// ---- AgentProfile ----

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  role: z
    .enum(['general', 'planner', 'coding', 'review', 'testing', 'research'])
    .default('general'),
  capabilities: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  modelPolicy: agentModelPolicySchema,
  executorPolicy: agentExecutorPolicySchema.nullable(),
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
export type CodingArtifact = z.infer<typeof codingArtifactSchema>;

export type MemoryScopeType = z.infer<typeof memoryScopeTypeSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryTier = z.infer<typeof memoryTierSchema>;
export type Memory = z.infer<typeof memorySchema>;

export type AgentModelPolicy = z.infer<typeof agentModelPolicySchema>;
export type AgentExecutorPolicy = z.infer<typeof agentExecutorPolicySchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;

// ---- Workspace Agent ----

export const workspaceAgentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  agentProfileId: z.string(),
  roleInWorkspace: z.enum(['owner', 'planner', 'builder', 'reviewer', 'tester', 'observer']),
  status: z.enum(['idle', 'running', 'completed', 'failed', 'blocked']),
  currentTaskId: z.string().nullable(),
  joinedAt: z.string(),
  leftAt: z.string().nullable(),
});

export type WorkspaceAgent = z.infer<typeof workspaceAgentSchema>;

// ---- Workspace Detail ----

export const workspaceDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  goal: z.string().nullable(),
  status: z.enum(['draft', 'planning', 'running', 'blocked', 'succeeded', 'failed', 'cancelled']),
  activeProjectId: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  summary: z.object({
    progress: z.number(),
    totalTasks: z.number(),
    completedTasks: z.number(),
    activeTasks: z.number(),
    blockedTasks: z.number(),
    failedTasks: z.number(),
    queuedTasks: z.number(),
    activeRuns: z.number(),
  }),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      taskCount: z.number(),
      completedTasks: z.number(),
      progress: z.number(),
    })
  ),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      status: z.string(),
      joinedAt: z.string(),
    })
  ),
  recentRuns: z.array(
    z.object({
      id: z.string(),
      agentName: z.string(),
      status: z.string(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    })
  ),
  pendingApprovals: z.array(
    z.object({
      id: z.string(),
      toolName: z.string(),
      risk: z.string(),
      createdAt: z.string(),
    })
  ),
});

export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

// ---- Artifact ----

export const artifactSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  type: z.enum(['spec', 'plan', 'file', 'report', 'scaffold']),
  title: z.string(),
  path: z.string().nullable(),
  content: z.string().nullable(),
  metadata: z.string().nullable(),
  createdAt: z.string(),
});

export type Artifact = z.infer<typeof artifactSchema>;
