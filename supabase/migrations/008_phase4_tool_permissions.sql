-- Phase 4: Tool Permissions
-- Approval Inbox and project-level permission memory

-- Approval Requests table
CREATE TABLE approval_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args JSON NOT NULL,
  risk TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired')),
  project_scope BOOLEAN NOT NULL DEFAULT 0,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests(run_id);

-- Permission Memories table
CREATE TABLE permission_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  tool_id TEXT NOT NULL,
  risk TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('auto', 'confirm', 'deny')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global', 'project', 'session')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_permission_memories_user ON permission_memories(user_id, tool_id);
CREATE INDEX IF NOT EXISTS idx_permission_memories_project ON permission_memories(project_id, tool_id);
