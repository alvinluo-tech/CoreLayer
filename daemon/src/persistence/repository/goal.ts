export interface GoalRow {
  id: string;
  userId: string;
  description: string;
  status: "active" | "paused" | "completed" | "abandoned";
  progress: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  description: string;
  status?: GoalRow["status"];
  progress?: unknown;
}

export interface UpdateGoalData {
  description?: string;
  status?: GoalRow["status"];
  progress?: unknown;
}

export interface GoalRepository {
  create(input: CreateGoalInput): Promise<GoalRow>;
  getById(id: string): Promise<GoalRow | null>;
  list(userId?: string): Promise<GoalRow[]>;
  getActive(userId?: string): Promise<GoalRow[]>;
  update(id: string, data: UpdateGoalData): Promise<GoalRow>;
  delete(id: string): Promise<boolean>;
}
