import type {
  MemoryRepository,
  MemoryRow,
  UpsertMemoryInput,
} from "../repository.js";

export function createSupabaseMemoryRepo(): MemoryRepository {
  return {
    async getAll(_userId?: string): Promise<MemoryRow[]> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async getByType(_type: MemoryRow["type"], _userId?: string): Promise<MemoryRow[]> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async getByKey(_key: string, _userId?: string): Promise<MemoryRow | null> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async search(_query: string, _userId?: string): Promise<MemoryRow[]> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async upsert(_input: UpsertMemoryInput): Promise<MemoryRow> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async delete(_id: string): Promise<boolean> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async cleanExpired(): Promise<number> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
    async clear(): Promise<number> {
      throw new Error("Supabase MemoryRepository not implemented — use SQLite mode");
    },
  };
}
