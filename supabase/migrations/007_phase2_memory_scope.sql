-- Phase 2: Memory Scope
-- Add scope columns to memories table for workspace/project/agent/task/conversation isolation

ALTER TABLE memories ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'user'
  CHECK(scope_type IN ('user', 'workspace', 'project', 'agent', 'task', 'conversation'));
ALTER TABLE memories ADD COLUMN scope_id TEXT;
ALTER TABLE memories ADD COLUMN source_run_id TEXT;
ALTER TABLE memories ADD COLUMN source_message_id TEXT;
ALTER TABLE memories ADD COLUMN last_verified_at TEXT;

-- Index for scope-based queries
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(user_id, scope_type, scope_id);
