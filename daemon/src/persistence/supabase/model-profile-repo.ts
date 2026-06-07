import type {
  ModelProfileRepository,
  ModelProfileRow,
  UpsertModelProfileInput,
} from "../repository.js";

export function createSupabaseModelProfileRepo(): ModelProfileRepository {
  return {
    async getAll(): Promise<ModelProfileRow[]> {
      throw new Error("Supabase ModelProfileRepository not implemented — use SQLite mode");
    },
    async getDefault(): Promise<ModelProfileRow | null> {
      throw new Error("Supabase ModelProfileRepository not implemented — use SQLite mode");
    },
    async upsert(_input: UpsertModelProfileInput): Promise<ModelProfileRow> {
      throw new Error("Supabase ModelProfileRepository not implemented — use SQLite mode");
    },
    async setDefault(_id: string): Promise<void> {
      throw new Error("Supabase ModelProfileRepository not implemented — use SQLite mode");
    },
    async delete(_id: string): Promise<boolean> {
      throw new Error("Supabase ModelProfileRepository not implemented — use SQLite mode");
    },
  };
}
