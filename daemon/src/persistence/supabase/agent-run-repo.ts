import type {
  AgentRunRepository,
  AgentRunRow,
  CreateAgentRunInput,
} from "../repository.js";

export function createSupabaseAgentRunRepo(): AgentRunRepository {
  return {
    async create(_input: CreateAgentRunInput): Promise<AgentRunRow> {
      throw new Error("Supabase AgentRunRepository not implemented — use SQLite mode");
    },
    async getById(_id: string): Promise<AgentRunRow | null> {
      throw new Error("Supabase AgentRunRepository not implemented — use SQLite mode");
    },
    async getByConversation(_conversationId: string): Promise<AgentRunRow[]> {
      throw new Error("Supabase AgentRunRepository not implemented — use SQLite mode");
    },
    async getRecent(_limit?: number): Promise<AgentRunRow[]> {
      throw new Error("Supabase AgentRunRepository not implemented — use SQLite mode");
    },
    async updateStatus(_id: string, _status: AgentRunRow["status"], _error?: string): Promise<void> {
      throw new Error("Supabase AgentRunRepository not implemented — use SQLite mode");
    },
  };
}
