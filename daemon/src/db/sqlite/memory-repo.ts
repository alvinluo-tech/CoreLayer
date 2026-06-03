import { eq, and, like, or, sql, isNull, gt } from "drizzle-orm";
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

// ---- Jaccard similarity for scored ranking ----

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

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
      const queryTokens = tokenize(query);
      if (queryTokens.size === 0) return [];

      // Fetch non-expired memories for user (expiry filter in SQL)
      const now = new Date().toISOString();
      const rows = db
        .select()
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.userId, userId),
            or(
              isNull(schema.memories.expiresAt),
              gt(schema.memories.expiresAt, now),
            ),
          ),
        )
        .all()
        .map(normalize);

      // Score each memory
      const scored: ScoredMemoryRow[] = rows
        .map((m) => {
          const keyTokens = tokenize(m.key);
          const valueTokens = tokenize(m.value);
          const docTokens = new Set([...keyTokens, ...valueTokens]);

          // Base score: Jaccard similarity
          let score = jaccardSimilarity(queryTokens, docTokens);

          // Key match bonus: if query matches key directly, boost
          if (m.key.toLowerCase().includes(query.toLowerCase())) {
            score += 0.3;
          }

          // Category boost
          const boost = CATEGORY_BOOSTS[m.type] ?? 1.0;
          score *= boost;

          // Confidence boost (if set)
          if (m.confidence != null) {
            score *= 0.8 + 0.4 * m.confidence; // range: [0.8, 1.2]
          }

          return { ...m, score };
        })
        .filter((m) => m.score > 0)
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

    async clear(): Promise<number> {
      const result = db.delete(schema.memories).run();
      return result.changes;
    },
  };
}
