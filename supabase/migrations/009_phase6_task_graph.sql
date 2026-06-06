-- Phase 6: Task Graph
-- Extend tasks table with dependency, decomposition, and execution tracking columns

ALTER TABLE tasks ADD COLUMN objective TEXT;
ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN dependencies JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN blocked_by JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN acceptance_criteria JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN artifacts JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN run_history JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN manual_intervention_required BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN rollback_plan TEXT;

-- Indexes for task graph queries
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
