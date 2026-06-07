import type {
  ToolCallLogRepository,
  ToolCallLogRow,
  CreateToolCallLogInput,
} from "../repository.js";

export function createSupabaseToolCallLogRepo(): ToolCallLogRepository {
  return {
    async create(_input: CreateToolCallLogInput): Promise<ToolCallLogRow> {
      throw new Error("Supabase ToolCallLogRepository not implemented — use SQLite mode");
    },
    async getByConversation(_conversationId: string): Promise<ToolCallLogRow[]> {
      throw new Error("Supabase ToolCallLogRepository not implemented — use SQLite mode");
    },
    async getByTool(_toolId: string): Promise<ToolCallLogRow[]> {
      throw new Error("Supabase ToolCallLogRepository not implemented — use SQLite mode");
    },
    async getRecent(_limit?: number): Promise<ToolCallLogRow[]> {
      throw new Error("Supabase ToolCallLogRepository not implemented — use SQLite mode");
    },
  };
}
