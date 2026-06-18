export interface MemoryRow {
  id: string;
  userId: string;
  scopeType: "user" | "workspace" | "project" | "agent" | "task" | "conversation";
  scopeId: string | null;
  type: "fact" | "preference" | "context" | "summary";
  tier: "preference" | "context" | "fact" | "pinned";
  key: string;
  value: string;
  source: string | null;
  confidence: number | null;
  uses: number;
  lastInjectedAt: string | null;
  sourceRunId: string | null;
  sourceMessageId: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoredMemoryRow extends MemoryRow {
  score: number;
}

export interface UpsertMemoryInput {
  userId?: string;
  scopeType?: MemoryRow["scopeType"];
  scopeId?: string | null;
  type: "fact" | "preference" | "context" | "summary";
  tier?: "preference" | "context" | "fact" | "pinned";
  key: string;
  value: string;
  source?: string;
  confidence?: number;
  sourceRunId?: string;
  sourceMessageId?: string;
  expiresAt?: string;
}

export interface MemoryRepository {
  getAll(userId?: string): Promise<MemoryRow[]>;
  getByType(type: MemoryRow["type"], userId?: string): Promise<MemoryRow[]>;
  getByTier(tier: MemoryRow["tier"], userId?: string): Promise<MemoryRow[]>;
  getByKey(key: string, userId?: string): Promise<MemoryRow | null>;
  fetchByScope(scopeType: MemoryRow["scopeType"], scopeId: string, userId?: string): Promise<MemoryRow[]>;
  fetchRelevantMemories(query: string, scope?: { type: MemoryRow["scopeType"]; id: string } | null, userId?: string, limit?: number): Promise<ScoredMemoryRow[]>;
  search(query: string, userId?: string): Promise<MemoryRow[]>;
  searchScored(query: string, userId?: string, limit?: number): Promise<ScoredMemoryRow[]>;
  upsert(input: UpsertMemoryInput): Promise<MemoryRow>;
  upsertPreferences(prefs: { key: string; value: string }[], userId?: string, scopeType?: MemoryRow["scopeType"], scopeId?: string | null): Promise<MemoryRow[]>;
  incrementUses(id: string): Promise<void>;
  recordInjection(id: string): Promise<void>;
  promoteHighUsage(minUses?: number): Promise<number>;
  delete(id: string): Promise<boolean>;
  cleanExpired(): Promise<number>;
  pruneUnusedMemories(maxAgeDays?: number): Promise<number>;
  clear(): Promise<number>;
  getPinned(userId?: string): Promise<MemoryRow[]>;
  pin(id: string): Promise<MemoryRow>;
  unpin(id: string): Promise<MemoryRow>;
}
