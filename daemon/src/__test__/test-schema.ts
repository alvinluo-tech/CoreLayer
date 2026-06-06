/**
 * Shared test DDL for the tasks table with all Phase 6 columns.
 * Import this in test files that create their own in-memory SQLite databases.
 */

export const TASKS_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    project_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    tags TEXT,
    completed_at TEXT,
    objective TEXT,
    assigned_agent_id TEXT,
    parent_task_id TEXT,
    dependencies JSON DEFAULT '[]',
    blocked_by JSON DEFAULT '[]',
    acceptance_criteria JSON DEFAULT '[]',
    artifacts JSON DEFAULT '[]',
    run_history JSON DEFAULT '[]',
    manual_intervention_required BOOLEAN DEFAULT 0,
    rollback_plan TEXT,
    created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
    updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
  );
`;
