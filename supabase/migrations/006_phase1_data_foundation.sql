-- Phase 1: Data Foundation
-- Adds Workspace, Project, AgentProfile tables and extends existing tables

-- Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default Workspace',
  description TEXT,
  owner_id TEXT NOT NULL,
  settings TEXT, -- JSON stored as text
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'completed')),
  settings TEXT, -- JSON stored as text
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Agent Profiles
CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model_policy TEXT NOT NULL DEFAULT '{}', -- JSON: preferred_models, fallback
  skills TEXT NOT NULL DEFAULT '[]', -- JSON array
  tools TEXT NOT NULL DEFAULT '[]', -- JSON array
  knowledge_scopes TEXT NOT NULL DEFAULT '[]', -- JSON array
  permissions TEXT NOT NULL DEFAULT '[]', -- JSON array
  memory_scopes TEXT NOT NULL DEFAULT '[]', -- JSON array
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Extend agent_runs table
ALTER TABLE agent_runs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE agent_runs ADD COLUMN project_id TEXT REFERENCES projects(id);
ALTER TABLE agent_runs ADD COLUMN task_id TEXT;
ALTER TABLE agent_runs ADD COLUMN agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE agent_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat' CHECK(mode IN ('chat', 'voice', 'tick', 'scheduled', 'workflow'));
ALTER TABLE agent_runs ADD COLUMN selected_tools TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE agent_runs ADD COLUMN memory_reads TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE agent_runs ADD COLUMN memory_writes TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE agent_runs ADD COLUMN tool_calls TEXT DEFAULT '[]'; -- JSON array of ToolCallTrace
ALTER TABLE agent_runs ADD COLUMN artifacts TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE agent_runs ADD COLUMN approvals TEXT DEFAULT '[]'; -- JSON array

-- Extend conversations table
ALTER TABLE conversations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id);

-- Extend tasks table
ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);

-- Create indexes for new foreign keys
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_agent_runs_workspace_id ON agent_runs(workspace_id);
CREATE INDEX idx_agent_runs_project_id ON agent_runs(project_id);
CREATE INDEX idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX idx_conversations_project_id ON conversations(project_id);
CREATE INDEX idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
