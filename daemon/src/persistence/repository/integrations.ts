// Tool call logs, app connections, and model profiles

export interface ToolCallLogRow {
  id: string;
  toolId: string;
  toolName: string;
  appId: string | null;
  source: "mcp" | "native" | "skill" | "rest";
  args: unknown | null;
  resultSuccess: boolean | null;
  resultData: unknown | null;
  resultError: string | null;
  risk: string | null;
  confirmedByUser: boolean | null;
  durationMs: number | null;
  conversationId: string | null;
  createdAt: string;
}

export interface CreateToolCallLogInput {
  toolId: string;
  toolName: string;
  appId?: string;
  source: "mcp" | "native" | "skill" | "rest";
  args?: unknown;
  resultSuccess?: boolean;
  resultData?: unknown;
  resultError?: string;
  risk?: string;
  confirmedByUser?: boolean;
  durationMs?: number;
  conversationId?: string;
}

export interface ToolCallLogRepository {
  create(input: CreateToolCallLogInput): Promise<ToolCallLogRow>;
  getByConversation(conversationId: string): Promise<ToolCallLogRow[]>;
  getByTool(toolId: string): Promise<ToolCallLogRow[]>;
  getRecent(limit?: number): Promise<ToolCallLogRow[]>;
}

export interface AppConnectionRow {
  id: string;
  appId: string;
  appName: string;
  source: "mcp" | "native" | "skill" | "rest";
  config: unknown | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastConnected: string | null;
  lastError: string | null;
  toolCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAppConnectionInput {
  appId: string;
  appName: string;
  source: "mcp" | "native" | "skill" | "rest";
  config?: unknown;
  status?: "disconnected" | "connecting" | "connected" | "error";
  lastError?: string;
  toolCount?: number;
}

export interface AppConnectionRepository {
  getAll(): Promise<AppConnectionRow[]>;
  getByAppId(appId: string): Promise<AppConnectionRow | null>;
  upsert(input: UpsertAppConnectionInput): Promise<AppConnectionRow>;
  delete(appId: string): Promise<boolean>;
}

export interface ModelProfileRow {
  id: string;
  provider: string;
  modelName: string;
  displayName: string | null;
  capabilities: unknown | null;
  limits: unknown | null;
  cost: unknown | null;
  isDefault: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertModelProfileInput {
  provider: string;
  modelName: string;
  displayName?: string;
  capabilities?: unknown;
  limits?: unknown;
  cost?: unknown;
  isDefault?: boolean;
}

export interface ModelProfileRepository {
  getAll(): Promise<ModelProfileRow[]>;
  getAllSync(): ModelProfileRow[];  // sync read for gateway init (better-sqlite3 is sync)
  getDefault(): Promise<ModelProfileRow | null>;
  upsert(input: UpsertModelProfileInput): Promise<ModelProfileRow>;
  setDefault(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
