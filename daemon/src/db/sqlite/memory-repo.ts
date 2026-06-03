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
