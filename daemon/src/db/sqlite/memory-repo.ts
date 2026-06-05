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

export function createSqliteMemoryRepo(database?: DrizzleDb): MemoryRepository {
  const db = database ?? defaultDb;
  return {
    async getAll(userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .all();
      return rows.map(normalize);
    },

    async getByType(type: MemoryRow["type"], userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.type, type)))
        .all();
      return rows.map(normalize);
    },

    async getByTier(tier: MemoryRow["tier"], userId = "default"): Promise<MemoryRow[]> {
      const rows = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.tier, tier)))
        .all();
      return rows.map(normalize);
    },

    async getByKey(key: string, userId = "default"): Promise<MemoryRow | null> {
      const row = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, key)))
        .get();
      return row ? normalize(row) : null;
    },

    async search(query: string, userId = "default"): Promise<MemoryRow[]> {
      const pattern = `%${query}%`;
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
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

      // Score and rank
      const scored: ScoredMemoryRow[] = rows
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
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    },

    async upsert(input: UpsertMemoryInput): Promise<MemoryRow> {
      // Prompt injection scan on both key and value
      if (containsInjection(input.key) || containsInjection(input.value)) {
        throw new Error(
          "Memory rejected: content contains potential prompt injection patterns",
        );
      }

      const now = new Date().toISOString();
      const userId = input.userId ?? "default";

      // Auto-classify tier if not explicitly provided
      const tier = input.tier ?? classifyTier(input.type, input.key, input.value);

      // Deduplication: case-insensitive exact match on key via SQL LOWER()
      const duplicate = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            sql`lower(${schema.memories.key}) = lower(${input.key})`,
          ),
        )
        .get();

      if (duplicate) {
        db.update(schema.memories)
          .set({
            value: input.value,
            type: input.type,
            tier,
            source: input.source ?? duplicate.source,
            confidence: input.confidence ?? duplicate.confidence,
            expiresAt: input.expiresAt ?? duplicate.expiresAt,
            updatedAt: now,
          })
          .where(eq(schema.memories.id, duplicate.id))
          .run();

        const row = db
          .select()
          .from(schema.memories)
          .where(eq(schema.memories.id, duplicate.id))
          .get()!;
        return normalize(row);
      }

      // No duplicate found -- insert
      db.insert(schema.memories)
        .values({
          id: crypto.randomUUID(),
          userId,
          type: input.type,
          tier,
          key: input.key,
          value: input.value,
          source: input.source ?? null,
          confidence: input.confidence ?? null,
          uses: 0,
          expiresAt: input.expiresAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const row = db
        .select()
        .from(schema.memories)
        .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, input.key)))
        .get()!;
      return normalize(row);
    },

    async upsertPreferences(prefs: { key: string; value: string }[], userId = "default"): Promise<MemoryRow[]> {
      const results: MemoryRow[] = [];
      const now = new Date().toISOString();
      for (const pref of prefs) {
        if (containsInjection(pref.key) || containsInjection(pref.value)) continue;

        const tier = classifyTier("preference", pref.key, pref.value);

        // Dedup: check for existing preference with same key
        const duplicate = db
          .select()
          .from(schema.memories)
          .where(
            and(
              eq(schema.memories.userId, userId),
              sql`lower(${schema.memories.key}) = lower(${pref.key})`,
            ),
          )
          .get();

        if (duplicate) {
          db.update(schema.memories)
            .set({
              value: pref.value,
              tier,
              source: "compression",
              confidence: 0.9,
              updatedAt: now,
            })
            .where(eq(schema.memories.id, duplicate.id))
            .run();
          const row = db.select().from(schema.memories).where(eq(schema.memories.id, duplicate.id)).get()!;
          results.push(normalize(row));
        } else {
          db.insert(schema.memories)
            .values({
              id: crypto.randomUUID(),
              userId,
              type: "preference",
              tier,
              key: pref.key,
              value: pref.value,
              source: "compression",
              confidence: 0.9,
              uses: 0,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          const row = db
            .select()
            .from(schema.memories)
            .where(and(eq(schema.memories.userId, userId), eq(schema.memories.key, pref.key)))
            .get()!;
          results.push(normalize(row));
        }
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
  };
}
