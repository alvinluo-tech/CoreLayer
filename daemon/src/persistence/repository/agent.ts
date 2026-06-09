// Agent runs, run events, and agent profiles

export interface AgentRunRow {
  id: string;
  conversationId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  agentId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "waiting_for_approval";
  mode: "chat" | "voice" | "tick" | "scheduled" | "workflow" | "regenerate";
  selectedModel: string | null;
  routeReason: string | null;
  selectedTools: string[] | null;
  memoryReads: string[] | null;
  memoryWrites: string[] | null;
  toolCalls: unknown[] | null;
  toolCallCount: number | null;
  artifacts: unknown[] | null;
  approvals: unknown[] | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface CreateAgentRunInput {
  conversationId?: string;
  workspaceId?: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  mode?: AgentRunRow["mode"];
  selectedModel?: string;
  routeReason?: string;
  selectedTools?: string[];
}

export interface AgentRunRepository {
  create(input: CreateAgentRunInput): Promise<AgentRunRow>;
  getById(id: string): Promise<AgentRunRow | null>;
  getByConversation(conversationId: string): Promise<AgentRunRow[]>;
  getRecent(limit?: number): Promise<AgentRunRow[]>;
  getQueued(limit?: number): Promise<AgentRunRow[]>;
  updateStatus(id: string, status: AgentRunRow["status"], error?: string): Promise<void>;
  updateArtifacts(id: string, artifacts: unknown[]): Promise<void>;
}

export interface AgentRunEventRow {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface CreateAgentRunEventInput {
  runId: string;
  sequence: number;
  type: string;
  payload?: unknown;
}

export interface AgentRunEventRepository {
  create(input: CreateAgentRunEventInput): Promise<AgentRunEventRow>;
  getByRunId(runId: string): Promise<AgentRunEventRow[]>;
  getByType(runId: string, type: string): Promise<AgentRunEventRow[]>;
}

export interface AgentProfileRow {
  id: string;
  name: string;
  description: string | null;
  role: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities: string[];
  enabled: boolean;
  modelPolicy: import("../../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy: import("../../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills: string[];
  tools: string[];
  knowledgeScopes: string[];
  permissions: string[];
  memoryScopes: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentProfileInput {
  name: string;
  description?: string;
  role?: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities?: string[];
  enabled?: boolean;
  modelPolicy?: import("../../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy?: import("../../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

export interface UpdateAgentProfileData {
  name?: string;
  description?: string;
  role?: "general" | "planner" | "coding" | "review" | "testing" | "research";
  capabilities?: string[];
  enabled?: boolean;
  modelPolicy?: import("../../shared/agent-profile-types.js").AgentModelPolicy;
  executorPolicy?: import("../../shared/agent-profile-types.js").AgentExecutorPolicy | null;
  skills?: string[];
  tools?: string[];
  knowledgeScopes?: string[];
  permissions?: string[];
  memoryScopes?: string[];
  isDefault?: boolean;
}

export interface AgentProfileRepository {
  create(input: CreateAgentProfileInput): Promise<AgentProfileRow>;
  getById(id: string): Promise<AgentProfileRow | null>;
  getAll(): Promise<AgentProfileRow[]>;
  getDefault(): Promise<AgentProfileRow | null>;
  update(id: string, data: UpdateAgentProfileData): Promise<AgentProfileRow>;
  delete(id: string): Promise<boolean>;
}
