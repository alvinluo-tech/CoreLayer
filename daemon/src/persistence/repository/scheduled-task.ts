export interface ScheduledTaskRow {
  id: string;
  name: string;
  cronExpr: string;
  prompt: string | null;
  skillName: string | null;
  input: unknown | null;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledTaskInput {
  name: string;
  cronExpr: string;
  prompt?: string;
  skillName?: string;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateScheduledTaskData {
  name?: string;
  cronExpr?: string;
  prompt?: string;
  skillName?: string;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ScheduledTaskRepository {
  getAll(): Promise<ScheduledTaskRow[]>;
  getById(id: string): Promise<ScheduledTaskRow | null>;
  upsert(input: CreateScheduledTaskInput): Promise<ScheduledTaskRow>;
  update(id: string, data: UpdateScheduledTaskData): Promise<ScheduledTaskRow>;
  delete(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  updateLastRun(id: string, lastRun: string, nextRun: string, result?: unknown): Promise<void>;
}
