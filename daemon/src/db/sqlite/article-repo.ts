import { eq, and } from "drizzle-orm";
import { db, schema } from "../client.js";
import type {
  ArticleRepository,
  ArticleRow,
  CreateArticleInput,
  ArticleFilters,
  UpdateArticleData,
} from "../repository.js";

export function createSqliteArticleRepo(): ArticleRepository {
  return {
    async create(input: CreateArticleInput): Promise<ArticleRow> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.articles)
        .values({
          id,
          userId: "local-user",
          url: input.url ?? null,
          title: input.title,
          description: input.description ?? null,
          status: "unread",
          category: input.category ?? null,
          addedAt: now,
        })
        .run();
      const row = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get()!;
      return row as ArticleRow;
    },

    async list(filters?: ArticleFilters): Promise<ArticleRow[]> {
      const conditions = [];
      if (filters?.status) conditions.push(eq(schema.articles.status, filters.status as "unread" | "reading" | "finished"));
      if (filters?.category) conditions.push(eq(schema.articles.category, filters.category));

      const query = db
        .select()
        .from(schema.articles)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const rows = filters?.limit ? query.limit(filters.limit).all() : query.all();
      return rows as ArticleRow[];
    },

    async getById(id: string): Promise<ArticleRow | null> {
      const row = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
      return (row as ArticleRow) ?? null;
    },

    async update(id: string, data: UpdateArticleData): Promise<ArticleRow> {
      const updates: Record<string, unknown> = {};
      if (data.status !== undefined) {
        updates.status = data.status;
        if (data.status === "reading") updates.startedAt = data.startedAt ?? new Date().toISOString();
        if (data.status === "finished") updates.finishedAt = data.finishedAt ?? new Date().toISOString();
      }
      if (data.rating !== undefined) updates.rating = data.rating;
      if (data.notes !== undefined) updates.notes = data.notes;

      db.update(schema.articles).set(updates).where(eq(schema.articles.id, id)).run();
      const row = db.select().from(schema.articles).where(eq(schema.articles.id, id)).get()!;
      return row as ArticleRow;
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(schema.articles).where(eq(schema.articles.id, id)).run();
      return result.changes > 0;
    },

    async clear(): Promise<number> {
      const result = db.delete(schema.articles).run();
      return result.changes;
    },
  };
}
