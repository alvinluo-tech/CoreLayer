import type {
  AppConnectionRepository,
  AppConnectionRow,
  UpsertAppConnectionInput,
} from "../repository.js";

export function createSupabaseAppConnectionRepo(): AppConnectionRepository {
  return {
    async getAll(): Promise<AppConnectionRow[]> {
      throw new Error("Supabase AppConnectionRepository not implemented — use SQLite mode");
    },
    async getByAppId(_appId: string): Promise<AppConnectionRow | null> {
      throw new Error("Supabase AppConnectionRepository not implemented — use SQLite mode");
    },
    async upsert(_input: UpsertAppConnectionInput): Promise<AppConnectionRow> {
      throw new Error("Supabase AppConnectionRepository not implemented — use SQLite mode");
    },
    async delete(_appId: string): Promise<boolean> {
      throw new Error("Supabase AppConnectionRepository not implemented — use SQLite mode");
    },
  };
}
