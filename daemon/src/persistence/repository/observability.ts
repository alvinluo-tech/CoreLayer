// Event log and audit log

export interface EventLogRow {
  id: string;
  type: string;
  projectId: string | null;
  taskId: string | null;
  agentRunId: string | null;
  runtimeId: string | null;
  payload: unknown | null;
  createdAt: string;
}

export interface CreateEventLogInput {
  type: string;
  projectId?: string | null;
  taskId?: string | null;
  agentRunId?: string | null;
  runtimeId?: string | null;
  payload?: unknown;
}

export interface EventLogFilters {
  type?: string;
  projectId?: string;
  workspaceId?: string;
  agentRunId?: string;
  runtimeId?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface EventLogRepository {
  create(input: CreateEventLogInput): Promise<EventLogRow>;
  query(filters?: EventLogFilters): Promise<EventLogRow[]>;
  count(filters?: EventLogFilters): Promise<number>;
}

export interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  resource: string;
  riskLevel: string | null;
  permissionDecision: string | null;
  confirmedByUser: boolean | null;
  result: string | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface CreateAuditLogInput {
  actor: string;
  action: string;
  resource: string;
  riskLevel?: string;
  permissionDecision?: string;
  confirmedByUser?: boolean;
  result?: string;
  metadata?: unknown;
}

export interface AuditLogFilters {
  actor?: string;
  action?: string;
  riskLevel?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogRow>;
  query(filters?: AuditLogFilters): Promise<AuditLogRow[]>;
  count(filters?: AuditLogFilters): Promise<number>;
}
