import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../../schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON"); // Enable Foreign Key Constraints

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Default Workspace',
      description TEXT,
      owner_id TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      active_project_id TEXT,
      completed_at TEXT,
      settings TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      spec TEXT,
      tech_stack TEXT,
      root_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      settings TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      role TEXT NOT NULL DEFAULT 'general',
      capabilities TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      model_policy TEXT NOT NULL DEFAULT '{}',
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      knowledge_scopes TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      memory_scopes TEXT NOT NULL DEFAULT '[]',
      executor_policy TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS workspace_agents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      agent_profile_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
      role_in_workspace TEXT NOT NULL DEFAULT 'builder',
      status TEXT NOT NULL DEFAULT 'idle',
      current_task_id TEXT,
      joined_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
      left_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      tags TEXT,
      completed_at TEXT,
      objective TEXT,
      assigned_agent_id TEXT REFERENCES agent_profiles(id),
      parent_task_id TEXT,
      dependencies TEXT DEFAULT '[]',
      blocked_by TEXT DEFAULT '[]',
      acceptance_criteria TEXT DEFAULT '[]',
      artifacts TEXT DEFAULT '[]',
      run_history TEXT DEFAULT '[]',
      manual_intervention_required INTEGER DEFAULT 0,
      rollback_plan TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      workspace_id TEXT REFERENCES workspaces(id),
      project_id TEXT REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL DEFAULT 'New Chat',
      model_used TEXT NOT NULL DEFAULT 'mimo-v2.5-pro',
      message_count INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      workspace_id TEXT REFERENCES workspaces(id),
      project_id TEXT REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      tool_call_id TEXT,
      parent_message_id TEXT,
      token_count INTEGER,
      compressed INTEGER NOT NULL DEFAULT 0,
      model_used TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      selected_model TEXT,
      route_reason TEXT,
      tool_call_count INTEGER DEFAULT 0,
      started_at TEXT DEFAULT 'CURRENT_TIMESTAMP',
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT,
      workspace_id TEXT REFERENCES workspaces(id),
      project_id TEXT REFERENCES projects(id),
      task_id TEXT,
      agent_id TEXT REFERENCES agent_profiles(id),
      mode TEXT NOT NULL DEFAULT 'chat',
      selected_tools TEXT DEFAULT '[]',
      memory_reads TEXT DEFAULT '[]',
      memory_writes TEXT DEFAULT '[]',
      tool_calls TEXT DEFAULT '[]',
      artifacts TEXT DEFAULT '[]',
      approvals TEXT DEFAULT '[]',
      agent_snapshot TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id),
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      project_scope INTEGER NOT NULL DEFAULT 0,
      decided_at INTEGER,
      created_at INTEGER NOT NULL,
      mode TEXT DEFAULT 'chat',
      source TEXT,
      preview TEXT,
      tool_call_id TEXT,
      expires_at INTEGER,
      operation_kind TEXT,
      operation_payload TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id),
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT 'CURRENT_TIMESTAMP'
    );

    CREATE TABLE IF NOT EXISTS permission_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      run_id TEXT,
      tool_id TEXT NOT NULL,
      risk TEXT NOT NULL,
      decision TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id),
      task_id TEXT,
      run_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT,
      content TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
    );
  `);
  return drizzle(sqlite, { schema });
}

const testDb = createTestDb();

vi.mock("../../client.js", () => ({ db: testDb, schema }));

const { createSqliteWorkspaceRepo } = await import("../workspace-repo.js");

const workspaceRepo = createSqliteWorkspaceRepo();

describe("WorkspaceRepository", () => {
  beforeEach(() => {
    testDb.delete(schema.workspaces).run();
    testDb.delete(schema.agentProfiles).run();
  });

  it("creates a workspace and returns it", async () => {
    const ws = await workspaceRepo.create({ name: "Demo Workspace", ownerId: "default" });
    expect(ws.id).toBeDefined();
    expect(ws.name).toBe("Demo Workspace");
    expect(ws.ownerId).toBe("default");
    expect(ws.status).toBe("draft");
  });

  it("deletes a workspace along with all referencing constraint records without constraint failures", async () => {
    // 1. Create a workspace
    const ws = await workspaceRepo.create({ name: "Demo WS", ownerId: "default" });

    // 2. Create an agent profile
    await testDb.insert(schema.agentProfiles).values({
      id: "agent-1",
      name: "Test Agent",
      role: "general",
      capabilities: "[]",
      enabled: true,
      modelPolicy: "{}",
      skills: "[]",
      tools: "[]",
      knowledgeScopes: "[]",
      permissions: "[]",
      memoryScopes: "[]",
    });

    // 3. Create referencing records
    // Project
    await testDb.insert(schema.projects).values({
      id: "proj-1",
      workspaceId: ws.id,
      name: "Project 1",
    });

    // Workspace agent
    await testDb.insert(schema.workspaceAgents).values({
      id: "wa-1",
      workspaceId: ws.id,
      agentProfileId: "agent-1",
    });

    // Task
    await testDb.insert(schema.tasks).values({
      id: "task-1",
      userId: "default",
      title: "Task 1",
      workspaceId: ws.id,
      projectId: "proj-1",
    });

    // Conversation
    await testDb.insert(schema.conversations).values({
      id: "conv-1",
      userId: "default",
      title: "Chat 1",
      workspaceId: ws.id,
      projectId: "proj-1",
    });

    // Message
    await testDb.insert(schema.messages).values({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "Hello",
    });

    // Agent Run
    await testDb.insert(schema.agentRuns).values({
      id: "run-1",
      conversationId: "conv-1",
      workspaceId: ws.id,
      projectId: "proj-1",
      agentId: "agent-1",
    });

    // Approval Request
    await testDb.insert(schema.approvalRequests).values({
      id: "appr-1",
      runId: "run-1",
      toolId: "write",
      toolName: "write",
      args: "{}",
      risk: "low",
      createdAt: Date.now(),
    });

    // Agent Run Event
    await testDb.insert(schema.agentRunEvents).values({
      id: "evt-1",
      runId: "run-1",
      sequence: 1,
      type: "step",
    });

    // Permission Memory
    await testDb.insert(schema.permissionMemories).values({
      id: "perm-1",
      userId: "default",
      projectId: "proj-1",
      toolId: "write",
      risk: "low",
      decision: "auto",
      createdAt: Date.now(),
    });

    // Artifact
    await testDb.insert(schema.artifacts).values({
      id: "art-1",
      workspaceId: ws.id,
      projectId: "proj-1",
      type: "spec",
      title: "Spec",
    });

    // Delete the workspace - this should successfully delete everything without FK error
    const deleted = await workspaceRepo.delete(ws.id);
    expect(deleted).toBe(true);

    // Verify workspace and all cascading/referencing entries are removed
    const foundWs = await workspaceRepo.getById(ws.id);
    expect(foundWs).toBeNull();

    const countTasks = testDb.select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ws.id)).all();
    expect(countTasks).toHaveLength(0);

    const countRuns = testDb.select().from(schema.agentRuns).where(eq(schema.agentRuns.workspaceId, ws.id)).all();
    expect(countRuns).toHaveLength(0);

    const countConvs = testDb.select().from(schema.conversations).where(eq(schema.conversations.workspaceId, ws.id)).all();
    expect(countConvs).toHaveLength(0);

    const countArtifacts = testDb.select().from(schema.artifacts).where(eq(schema.artifacts.workspaceId, ws.id)).all();
    expect(countArtifacts).toHaveLength(0);
  });
});
