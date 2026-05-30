import { getSupabaseClient } from "./client.js";
import type {
  ArticleRepository,
  ArticleRow,
  CreateArticleInput,
  ArticleFilters,
  UpdateArticleData,
} from "../repository.js";

const TABLE = "articles";

function toArticleRow(row: Record<string, unknown>): ArticleRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    url: (row.url as string) ?? null,
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as ArticleRow["status"],
    rating: (row.rating as number) ?? null,
    notes: (row.notes as string) ?? null,
    category: (row.category as string) ?? null,
    addedAt: (row.added_at as string) ?? "",
    startedAt: (row.started_at as string) ?? null,
    finishedAt: (row.finished_at as string) ?? null,
  };
}

export function createSupabaseArticleRepo(): ArticleRepository {
  const client = getSupabaseClient();

  return {
    async create(input: CreateArticleInput): Promise<ArticleRow> {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: "local-user",
          url: input.url ?? null,
          title: input.title,
          description: input.description ?? null,
          status: "unread",
          category: input.category ?? null,
          added_at: now,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create article: ${error.message}`);
      return toArticleRow(data);
    },

    async list(filters?: ArticleFilters): Promise<ArticleRow[]> {
      let query = client.from(TABLE).select("*");

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw new Error(`Failed to list articles: ${error.message}`);
      return (data ?? []).map(toArticleRow);
    },

    async getById(id: string): Promise<ArticleRow | null> {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .single();

      if (error) return null;
      return toArticleRow(data);
    },

    async update(id: string, data: UpdateArticleData): Promise<ArticleRow> {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {};

      if (data.status !== undefined) {
        updates.status = data.status;
        if (data.status === "reading") updates.started_at = data.startedAt ?? now;
        if (data.status === "finished") updates.finished_at = data.finishedAt ?? now;
      }
      if (data.rating !== undefined) updates.rating = data.rating;
      if (data.notes !== undefined) updates.notes = data.notes;

      const { data: row, error } = await client
        .from(TABLE)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update article: ${error.message}`);
      return toArticleRow(row);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await client
        .from(TABLE)
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Failed to delete article: ${error.message}`);
      return true;
    },

    async clear(): Promise<number> {
      const { count, error } = await client
        .from(TABLE)
        .delete({ count: "exact" })
        .neq("id", "");
      if (error) throw new Error(`Failed to clear articles: ${error.message}`);
      return count ?? 0;
    },
  };
}
