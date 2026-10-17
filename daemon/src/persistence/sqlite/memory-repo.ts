import { eq, and, like, or, sql, isNull, gt, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as defaultDb, schema } from "../client.js";
import type {
  MemoryRepository,
  MemoryRow,
  ScoredMemoryRow,
  UpsertMemoryInput,
} from "../repository.js";

type DrizzleDb = BetterSQLite3Database<typeof schema>;

function normalize(row: typeof schema.memories.$inferSelect): MemoryRow {
  return { ...row };
}

// ---- Auto-classify tier based on content patterns (Hermes pattern) ----

const PREFERENCE_PATTERNS: RegExp[] = [
  /用户喜[欢好]/i,
  /偏好/i,
  /习惯/i,
  /喜欢/i,
  /prefer/i,
  /favorite/i,
  /习惯用/i,
  /常用/i,
  /风格/i,
  /风格是/i,
];

const FACT_PATTERNS: RegExp[] = [
  /是\d{4}/,
  /地址是/,
  /电话是/,
  /邮箱是/,
  /位于/,
  /成立于/,
  /出生/,
  /id是/i,
  /编号是/,
  /版本是/,
];

function classifyTier(
  type: MemoryRow["type"],
  key: string,
  value: string,
): MemoryRow["tier"] {
  // Explicit type mappings
  if (type === "preference") return "preference";
  if (type === "fact") return "fact";

  // For "context" and "summary" types, check content patterns
  const combined = `${key} ${value}`;
  if (PREFERENCE_PATTERNS.some((p) => p.test(combined))) return "preference";
  if (FACT_PATTERNS.some((p) => p.test(combined))) return "fact";

  // Default: context
  return "context";
}

// ---- Prompt injection scanning (Hermes pattern) ----

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system:\s*/i,
  /assistant:\s*/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /override\s+(all\s+)?instructions/i,
  /exfiltrate/i,
  /send\s+(all\s+)?(data|info|memory)\s+to/i,
  /curl\s+https?:\/\//i,
  /fetch\s*\(\s*https?:\/\//i,
  /\bbase64\b.*\bencode\b/i,
];

function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

// ---- Category boost multipliers (Odysseus pattern) ----

const CATEGORY_BOOSTS: Record<MemoryRow["type"], number> = {
  preference: 1.2,
  context: 1.1,
  summary: 1.0,
  fact: 1.0,
};

// ---- Multi-signal temporal retrieval scoring (Mem0 v3 paradigm) ----

export interface MemoryScoreCandidate {
  /** 0-based position in the lexical (BM25/LIKE) ranking. */
  bm25Rank: number;
  /** Lexical/structural similarity contribution, 0..~1.5. */
  vectorSim: number;
  /** ISO creation timestamp of the memory version. */
  createdAt: string;
  /** Whether a newer version of the same fact has superseded this row. */
  isSuperseded: boolean;
}

/**
 * Hybrid retrieval score fusing lexical ranking and temporal decay:
 *
 *   score = (1/(60 + bm25Rank) + 0.4 * vectorSim) * exp(-0.05 * daysAgo) * penalty
 *
 * - Recency decays ~5%/day, so fresh facts naturally outrank stale ones.
 * - Superseded versions are kept retrievable but heavily down-weighted (0.3x).
 * - Malformed timestamps score 0 (never surface undated junk); future dates
 *   are clamped to "today".
 */
export function computeMemoryScore(candidate: MemoryScoreCandidate): number {
  const parsed = new Date(candidate.createdAt).getTime();
  if (!Number.isFinite(parsed)) return 0;
  const daysAgo = Math.max(0, (Date.now() - parsed) / (86_400_000));
  const recencyDecay = Math.exp(-0.05 * daysAgo); // ~5% decay per day
  const supersededPenalty = candidate.isSuperseded ? 0.3 : 1.0;

  const rrf = 1 / (60 + candidate.bm25Rank) + candidate.vectorSim * 0.4;
  return rrf * recencyDecay * supersededPenalty;
}

/** Fuse a lexical-scored, pre-ranked candidate list with the temporal formula. */
function applyTemporalFusion(
  lexicalScored: ScoredMemoryRow[],
  limit: number,
): ScoredMemoryRow[] {
  return lexicalScored
    .map((m, index) => ({
      ...m,
      score: computeMemoryScore({
        bm25Rank: index,
        vectorSim: m.score,
        createdAt: m.createdAt,
        isSuperseded: m.supersededBy !== null,
      }),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Condition selecting the CURRENT version of every memory (ADD-only history). */
function currentVersionOnly() {
  return isNull(schema.memories.supersededBy);
}

// ---- Single-pass append write (ADD-only with supersede) ----

interface AppendMemoryInput {
  userId: string;
  scopeType: MemoryRow["scopeType"];
  scopeId: string | null;
  type: MemoryRow["type"];
  tier: MemoryRow["tier"];
  key: string;
  value: string;
  source: string | null;
  confidence: number | null;
  sourceRunId: string | null;
  sourceMessageId: string | null;
  expiresAt: string | null;
  temporalAnchor: string | null;
}

/**
 * Append a memory version without destroying history.
 *
 * - New (scope, key): plain insert.
 * - Same (scope, key) with a CHANGED value: mark every current row
 *   supersededBy = <new id>, then insert the new version (carrying the usage
 *   counter). Superseded rows stay queryable but down-ranked at retrieval.
 * - Same (scope, key) with an IDENTICAL value: bump lastVerifiedAt only —
 *   re-extracting a stable fact must not pile up duplicate history.
 */
function appendWithSupersede(db: DrizzleDb, input: AppendMemoryInput): MemoryRow {
  const now = new Date().toISOString();
  const scopeCondition = input.scopeId === null
    ? isNull(schema.memories.scopeId)
    : eq(schema.memories.scopeId, input.scopeId);

  // Current versions of this (scope, key). Normally zero or one; superseding
  // ALL of them self-heals crash leftovers (two simultaneous currents).
  const currents = db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.userId, input.userId),
        eq(schema.memories.scopeType, input.scopeType),
        scopeCondition,
        sql`lower(${schema.memories.key}) = lower(${input.key})`,
        isNull(schema.memories.supersededBy),
      ),
    )
    .all();

  if (
    currents.length === 1 &&
    currents[0].value === input.value &&
    currents[0].type === input.type
  ) {
    const existing = currents[0];
    db.update(schema.memories)
      .set({ lastVerifiedAt: now, updatedAt: now })
      .where(eq(schema.memories.id, existing.id))
      .run();
    const row = db.select().from(schema.memories).where(eq(schema.memories.id, existing.id)).get()!;
    return normalize(row);
  }

  const newId = crypto.randomUUID();
  const carriedUses = currents.length > 0 ? Math.max(...currents.map((c) => c.uses)) : 0;

  db.insert(schema.memories)
    .values({
      id: newId,
      userId: input.userId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      type: input.type,
      tier: input.tier,
      key: input.key,
      value: input.value,
      source: input.source,
      confidence: input.confidence,
      uses: carriedUses,
      sourceRunId: input.sourceRunId,
      sourceMessageId: input.sourceMessageId,
      expiresAt: input.expiresAt,
      validFrom: now,
      supersededBy: null,
      temporalAnchor: input.temporalAnchor,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  for (const current of currents) {
    db.update(schema.memories)
      .set({ supersededBy: newId, updatedAt: now })
      .where(eq(schema.memories.id, current.id))
      .run();
  }

  const row = db.select().from(schema.memories).where(eq(schema.memories.id, newId)).get()!;
  return normalize(row);
}

export function createSqliteMemoryRepo(database?: DrizzleDb): MemoryRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), currentVersionOnly()))
        .all();
      return rows.map(normalize);
    },

    async getByType(type: MemoryRow["type"], userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.type, type), currentVersionOnly()))
        .all();
      return rows.map(normalize);
    },

    async getByTier(tier: MemoryRow["tier"], userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.tier, tier), currentVersionOnly()))
        .all();
      return rows.map(normalize);
    },

    async getByKey(key: string, userId = "default"): Promise<MemoryRow | null> {
      // Latest current version of the key — superseded history stays in the table.
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), sql`lower(${schema.memories.key}) = lower(${key})`, currentVersionOnly()))
        .orderBy(sql`${schema.memories.createdAt} DESC`)
        .limit(1)
        .all();
      return rows[0] ? normalize(rows[0]) : null;
    },

    async fetchByScope(scopeType: MemoryRow["scopeType"], scopeId: string, userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            eq(schema.memories.scopeType, scopeType),
            eq(schema.memories.scopeId, scopeId),
            currentVersionOnly(),
          ),
        )
        .all();
      return rows.map(normalize);
    },

    async fetchRelevantMemories(
      query: string,
      scope: { type: MemoryRow["scopeType"]; id: string } | null = null,
      userId = "default",
      limit = 10,
    ): Promise<ScoredMemoryRow[]> {
      // Build scope conditions: user-level memories always included,
      // plus memories matching the given scope
      const scopeConditions = scope
        ? or(
            eq(schema.memories.scopeType, "user"),
            and(
              eq(schema.memories.scopeType, scope.type),
              eq(schema.memories.scopeId, scope.id),
            ),
          )
        : eq(schema.memories.scopeType, "user");

      const now = new Date().toISOString();
      // Candidate pool includes superseded versions — retrieval-time conflict
      // resolution down-weights them (0.3x) instead of dropping history.
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            scopeConditions,
            or(isNull(schema.memories.expiresAt), gt(schema.memories.expiresAt, now)),
          ),
        )
        .all()
        .map(normalize);

      // Lexical relevance pass: match query against key and value
      const queryLower = query.toLowerCase();
      const lexicalScored: ScoredMemoryRow[] = rows
        .map((m) => {
          let score = 0;
          const keyLower = m.key.toLowerCase();
          const valueLower = m.value.toLowerCase();

          // Exact key match
          if (keyLower === queryLower) score += 1.0;
          // Key contains query
          else if (keyLower.includes(queryLower)) score += 0.7;
          // Value contains query
          else if (valueLower.includes(queryLower)) score += 0.5;

          // Scope-level boost: more specific scope = higher relevance
          if (scope && m.scopeType === scope.type && m.scopeId === scope.id) {
            score += 0.3;
          }

          // Category boost
          const boost = CATEGORY_BOOSTS[m.type] ?? 1.0;
          score *= boost;

          // Confidence boost
          if (m.confidence != null) {
            score *= 0.8 + 0.4 * m.confidence;
          }

          return { ...m, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score);

      // Temporal fusion: recency decay + superseded penalty over the lexical ranking.
      return applyTemporalFusion(lexicalScored, limit);
    },

    async search(query: string, userId = "default"): Promise<MemoryRow[]> {
      const pattern = `%${query}%`;
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            currentVersionOnly(),
            or(
              like(schema.memories.key, pattern),
              like(schema.memories.value, pattern),
            ),
          ),
        )
        .all();
      return rows.map(normalize);
    },

    async searchScored(query: string, userId = "default", limit = 10): Promise<ScoredMemoryRow[]> {
      if (!query.trim()) return [];

      // Sanitize query for FTS5: escape special characters and use OR for multi-word queries
      const ftsQuery = query
        .replace(/[^\w一-鿿]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .join(" OR ");

      if (!ftsQuery) return [];

      // Fetch non-expired memories for user (expiry filter in SQL)
      const now = new Date().toISOString();

      // Try FTS5 search first, fall back to LIKE search if FTS fails
      let rows: MemoryRow[];
      try {
        // FTS5 search with BM25 ranking
        const ftsResults = db.all(
          sql`SELECT m.* FROM memories m
              INNER JOIN memories_fts fts ON m.rowid = fts.rowid
              WHERE memories_fts MATCH ${ftsQuery}
              AND m.user_id = ${userId}
              AND (m.expires_at IS NULL OR m.expires_at > ${now})
              ORDER BY rank
              LIMIT ${limit * 2}`,
        ) as Array<typeof schema.memories.$inferSelect>;
        rows = ftsResults.map(normalize);
      } catch {
        // FTS query failed (e.g., syntax error), fall back to LIKE
        // Split query into words and match any word against key or value
        const words = query.replace(/[^\w一-鿿]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 0);
        const likeConditions = words.length > 0
          ? or(
              ...words.flatMap((w) => [
                like(schema.memories.key, `%${w}%`),
                like(schema.memories.value, `%${w}%`),
              ]),
            )
          : or(
              like(schema.memories.key, `%${query}%`),
              like(schema.memories.value, `%${query}%`),
            );
        const likeResults = db
          .select()
          .from(schema.memories)
          .where(
            and(
              eq(schema.memories.userId, userId),
              or(
                isNull(schema.memories.expiresAt),
                gt(schema.memories.expiresAt, now),
              ),
              likeConditions,
            ),
          )
          .limit(limit * 2)
          .all();
        rows = likeResults.map(normalize);
      }

      // Lexical scoring pass (superseded versions stay in the candidate pool)
      const lexicalScored: ScoredMemoryRow[] = rows
        .map((m) => {
          let score = 0.5; // base score from FTS/LIKE match

          // Key match bonus
          if (m.key.toLowerCase().includes(query.toLowerCase())) {
            score += 0.3;
          }

          // Category boost
          const boost = CATEGORY_BOOSTS[m.type] ?? 1.0;
          score *= boost;

          // Confidence boost
          if (m.confidence != null) {
            score *= 0.8 + 0.4 * m.confidence;
          }

          return { ...m, score };
        })
        .sort((a, b) => b.score - a.score);

      // Temporal fusion: BM25 rank + recency decay + superseded penalty.
      return applyTemporalFusion(lexicalScored, limit);
    },

    async upsert(input: UpsertMemoryInput): Promise<MemoryRow> {
      // Prompt injection scan on both key and value
      if (containsInjection(input.key) || containsInjection(input.value)) {
        throw new Error(
          "Memory rejected: content contains potential prompt injection patterns",
        );
      }

      const userId = input.userId ?? "default";
      const scopeType = input.scopeType ?? "user";
      const scopeId = input.scopeId ?? null;

      // Auto-classify tier if not explicitly provided
      const tier = input.tier ?? classifyTier(input.type, input.key, input.value);

      return appendWithSupersede(db, {
        userId,
        scopeType,
        scopeId,
        type: input.type,
        tier,
        key: input.key,
        value: input.value,
        source: input.source ?? null,
        confidence: input.confidence ?? null,
        sourceRunId: input.sourceRunId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        expiresAt: input.expiresAt ?? null,
        temporalAnchor: input.temporalAnchor ?? null,
      });
    },

    async upsertPreferences(
      prefs: { key: string; value: string }[],
      userId = "default",
      scopeType: MemoryRow["scopeType"] = "user",
      scopeId: string | null = null,
    ): Promise<MemoryRow[]> {
      const results: MemoryRow[] = [];
      for (const pref of prefs) {
        if (containsInjection(pref.key) || containsInjection(pref.value)) continue;

        const tier = classifyTier("preference", pref.key, pref.value);

        results.push(
          await appendWithSupersede(db, {
            userId,
            scopeType,
            scopeId,
            type: "preference",
            tier,
            key: pref.key,
            value: pref.value,
            source: "compression",
            confidence: 0.9,
            sourceRunId: null,
            sourceMessageId: null,
            expiresAt: null,
            temporalAnchor: null,
          }),
        );
      }
      return results;
    },

    async incrementUses(id: string): Promise<void> {
      const result = db.update(schema.memories)
        .set({ uses: sql`${schema.memories.uses} + 1` })
        .where(eq(schema.memories.id, id))
        .run();
      if (result.changes === 0) {
        throw new Error(`Memory not found: ${id}`);
      }
    },

    async recordInjection(id: string): Promise<void> {
      const now = new Date().toISOString();
      const result = db.update(schema.memories)
        .set({
          uses: sql`${schema.memories.uses} + 1`,
          lastInjectedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.memories.id, id))
        .run();
      if (result.changes === 0) {
        throw new Error(`Memory not found: ${id}`);
      }
    },

    async promoteHighUsage(minUses = 5): Promise<number> {
      const now = new Date().toISOString();
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            sql`${schema.memories.uses} >= ${minUses}`,
            sql`${schema.memories.tier} != 'preference'`,
            currentVersionOnly(),
          ),
        )
        .all();

      let promoted = 0;
      for (const row of rows) {
        db.update(schema.memories)
          .set({ tier: "preference", updatedAt: now })
          .where(eq(schema.memories.id, row.id))
          .run();
        promoted++;
      }
      return promoted;
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(schema.memories).where(eq(schema.memories.id, id)).run();
      return result.changes > 0;
    },

    async cleanExpired(): Promise<number> {
      const now = new Date().toISOString();
      const all = db.select().from(schema.memories).all() as typeof schema.memories.$inferSelect[];
      const expired = all.filter((m: typeof schema.memories.$inferSelect) => m.expiresAt !== null && m.expiresAt < now);

      let deleted = 0;
      for (const mem of expired) {
        db.delete(schema.memories).where(eq(schema.memories.id, mem.id)).run();
        deleted++;
      }
      return deleted;
    },

    async pruneUnusedMemories(maxAgeDays = 30): Promise<number> {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);
      const cutoffStr = cutoff.toISOString();

      // Delete memories with uses === 0 AND createdAt < cutoff
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.uses, 0),
            lte(schema.memories.createdAt, cutoffStr),
          ),
        )
        .all();

      let deleted = 0;
      for (const row of rows) {
        db.delete(schema.memories).where(eq(schema.memories.id, row.id)).run();
        deleted++;
      }
      return deleted;
    },

    async clear(): Promise<number> {
      const result = db.delete(schema.memories).run();
      return result.changes;
    },

    async getPinned(userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.tier, "pinned"), currentVersionOnly()))
        .all();
      return rows.map(normalize);
    },

    async pin(id: string): Promise<MemoryRow> {
      const now = new Date().toISOString();
      const result = db
        .update(schema.memories)
        .set({ tier: "pinned", updatedAt: now })
        .where(eq(schema.memories.id, id))
        .run();
      if (result.changes === 0) {
        throw new Error(`Memory not found: ${id}`);
      }
      const row = db.select().from(schema.memories).where(eq(schema.memories.id, id)).get()!;
      return normalize(row);
    },

    async unpin(id: string): Promise<MemoryRow> {
      const now = new Date().toISOString();
      const row = db.select().from(schema.memories).where(eq(schema.memories.id, id)).get();
      if (!row) throw new Error(`Memory not found: ${id}`);
      // Restore to auto-classified tier based on content
      const restoredTier = classifyTier(row.type as MemoryRow["type"], row.key, row.value);
      const result = db
        .update(schema.memories)
        .set({ tier: restoredTier, updatedAt: now })
        .where(eq(schema.memories.id, id))
        .run();
      if (result.changes === 0) {
        throw new Error(`Memory not found: ${id}`);
      }
      const updated = db.select().from(schema.memories).where(eq(schema.memories.id, id)).get()!;
      return normalize(updated);
    },
  };
}
