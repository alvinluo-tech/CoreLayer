# Jarvis Agent OS 重构计划

> 基于 `agent-os-product-vision.md` 愿景，将 Jarvis 从 Chat-Centric 架构迁移到 Task-Centric 架构的分阶段实施计划。

## 重构原则

1. **渐进式迁移**：每个阶段完成后合并到 main，确保系统始终可用
2. **向后兼容**：新功能不破坏现有 chat 功能
3. **数据优先**：先完善数据模型，再改 UI
4. **向后兼容**：每个阶段有独立的测试验证点

## 阶段划分

| 阶段 | 名称 | 核心目标 | 预计周期 |
|------|------|----------|----------|
| Phase 1 | 数据基础 | Workspace/Project/AgentRun/AgentProfile 表结构 | 2-3 天 |
| Phase 2 | Memory Scope | 带作用域的记忆系统 | 1-2 天 |
| Phase 3 | 统一 runTurn | 合并所有 agent loop 路径 | 2-3 天 |
| Phase 4 | 工具权限增强 | Approval Inbox + 项目级权限 | 1-2 天 |
| Phase 5 | 项目 UI | 基础项目管理工作空间 | 2-3 天 |
| Phase 6 | Task Graph | 任务依赖与执行追踪 | 2-3 天 |

---

## Phase 1: 数据基础

**目标**：建立 Workspace、Project、AgentRun、AgentProfile 的数据库表结构，为后续功能预留归属字段。

**分支名**：`refactor/phase1-data-foundation`

### 1.1 新增数据库表

#### Workspace 表

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default Workspace',
  description TEXT,
  owner_id TEXT NOT NULL,
  settings JSON,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### Project 表

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'completed')),
  settings JSON,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### AgentProfile 表

```sql
CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model_policy JSON NOT NULL DEFAULT '{}',
  skills JSON NOT NULL DEFAULT '[]',
  tools JSON NOT NULL DEFAULT '[]',
  knowledge_scopes JSON NOT NULL DEFAULT '[]',
  permissions JSON NOT NULL DEFAULT '[]',
  memory_scopes JSON NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 1.2 扩展现有表

#### agentRuns 表扩展

```sql
ALTER TABLE agent_runs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE agent_runs ADD COLUMN project_id TEXT REFERENCES projects(id);
ALTER TABLE agent_runs ADD COLUMN task_id TEXT;
ALTER TABLE agent_runs ADD COLUMN agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE agent_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat' CHECK(mode IN ('chat', 'voice', 'tick', 'scheduled', 'workflow'));
ALTER TABLE agent_runs ADD COLUMN selected_tools JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN memory_reads JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN memory_writes JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN tool_calls JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN artifacts JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN approvals JSON DEFAULT '[]';
ALTER TABLE agent_runs ADD COLUMN started_at INTEGER NOT NULL;
ALTER TABLE agent_runs ADD COLUMN ended_at INTEGER;
ALTER TABLE agent_runs ADD COLUMN result JSON;
ALTER TABLE agent_runs ADD COLUMN error TEXT;
```

#### conversations 表扩展

```sql
ALTER TABLE conversations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id);
```

#### tasks 表扩展

```sql
ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);
```

### 1.3 实现步骤

1. 创建新的 SQLite 迁移文件 `006_phase1_data_foundation.sql`
2. 更新 `daemon/src/db/schema.ts` 添加新表定义
3. 更新 `daemon/src/db/repository.ts` 添加 Repository 接口
4. 创建 `daemon/src/db/sqlite/workspace-repo.ts`
5. 创建 `daemon/src/db/sqlite/project-repo.ts`
6. 创建 `daemon/src/db/sqlite/agent-profile-repo.ts`
7. 更新 `daemon/src/db/factory.ts` 注册新 Repository
8. 创建默认数据初始化逻辑（默认 workspace、默认 Jarvis Agent）
9. 编写单元测试验证数据操作

### 1.4 测试验证

- [ ] 新增的表可以正常 CRUD
- [ ] agent_runs 新字段可以正常写入和查询
- [ ] conversations/tasks 新字段可以正常关联
- [ ] 默认数据可以正确初始化
- [ ] 现有对话功能不受影响

---

## Phase 2: Memory Scope

**目标**：给 memories 表添加 scope 支持，实现按 user/workspace/project/agent/task/conversation 作用域的记忆隔离。

**分支名**：`refactor/phase2-memory-scope`
**依赖**：Phase 1

### 2.1 扩展 memories 表

```sql
ALTER TABLE memories ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'user' CHECK(scope_type IN ('user', 'workspace', 'project', 'agent', 'task', 'conversation'));
ALTER TABLE memories ADD COLUMN scope_id TEXT;
ALTER TABLE memories ADD COLUMN source_run_id TEXT;
ALTER TABLE memories ADD COLUMN source_message_id TEXT;
ALTER TABLE memories ADD COLUMN last_verified_at INTEGER;
```

### 2.2 更新 Memory Repo

- `fetchRelevantMemories()` 方法增加 scope 参数
- 新增 `fetchByScope(scopeType, scopeId)` 方法
- 新增 `migrateExistingMemories()` 方法将现有记忆标记为 user scope

### 2.3 更新 ContextBuilder

- `buildContext()` 接收 scope 参数
- 根据 scope 从不同层级获取记忆：
  - user scope: 全局用户偏好
  - project scope: 项目特定知识
  - conversation scope: 当前对话上下文

### 2.4 实现步骤

1. 创建迁移文件 `007_phase2_memory_scope.sql`
2. 更新 `daemon/src/db/schema.ts` memories 表定义
3. 更新 `daemon/src/db/sqlite/memory-repo.ts` 添加 scope 支持
4. 更新 `daemon/src/orchestrator/context-builder.ts` 支持 scope 查询
5. 更新 `daemon/src/orchestrator/conversation.ts` 传递 scope 信息
6. 实现记忆迁移逻辑
7. 编写单元测试

### 2.5 测试验证

- [ ] 现有记忆查询不受影响（向后兼容）
- [ ] 新记忆可以按 scope 写入
- [ ] 按 scope 查询记忆正常工作
- [ ] 对话中的记忆提取使用正确的 scope
- [ ] 迁移逻辑正确标记现有记忆

---

## Phase 3: 统一 runTurn

**目标**：将 conversation.ts 中的 6+ 个独立 agent loop 路径收敛为统一的 `runTurn` 入口。

**分支名**：`refactor/phase3-unified-runturn`
**依赖**：Phase 1

### 3.1 定义统一接口

```typescript
// daemon/src/runtime/agent-run.ts

interface AgentRunRequest {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  conversationId?: string;
  agentId: string;
  mode: 'chat' | 'voice' | 'tick' | 'scheduled' | 'workflow';
  input: unknown;
  constraints?: {
    maxSteps?: number;
    maxTokens?: number;
    requireApproval?: boolean;
  };
}

type AgentRunEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'model_selected'; modelId: string }
  | { type: 'memory_read'; memoryIds: string[] }
  | { type: 'tool_call'; toolCall: ToolCallTrace }
  | { type: 'approval_required'; approval: ApprovalRequest }
  | { type: 'artifact_created'; artifact: ArtifactRef }
  | { type: 'memory_written'; memoryIds: string[] }
  | { type: 'delta'; text: string }
  | { type: 'run_completed'; result: unknown }
  | { type: 'run_failed'; error: string };

async function* runTurn(request: AgentRunRequest): AsyncIterable<AgentRunEvent>;
```

### 3.2 重构 conversation.ts

将当前的 `handleMessageInConversation` 和 `streamMessageInConversation` 拆分为：

1. `createAgentRun()` - 创建 AgentRun 记录
2. `prepareContext()` - 加载历史、记忆、构建 context
3. `executeLLM()` - 调用模型执行
4. `handleToolCalls()` - 处理工具调用
5. `saveResults()` - 保存消息和更新 AgentRun

### 3.3 迁移现有入口

- `handleMessageInConversation` → 调用 `runTurn({ mode: 'chat', ... })`
- `streamMessageInConversation` → 调用 `runTurn({ mode: 'chat', ... })` 并 yield 事件
- `runTick` → 调用 `runTurn({ mode: 'tick', ... })`
- `executeTask` → 调用 `runTurn({ mode: 'scheduled', ... })`

### 3.4 实现步骤

1. 创建 `daemon/src/runtime/agent-run.ts` 定义接口
2. 创建 `daemon/src/runtime/run-executor.ts` 实现核心执行逻辑
3. 重构 `daemon/src/orchestrator/conversation.ts` 调用 runTurn
4. 更新 `daemon/src/api/conversations.ts` 使用新的流式事件
5. 更新 `daemon/src/scheduler.ts` 使用 runTurn
6. 确保所有执行都创建 AgentRun 记录
7. 编写集成测试

### 3.5 测试验证

- [ ] 聊天消息通过 runTurn 正常执行
- [ ] TICK 通过 runTurn 正常执行
- [ ] 定时任务通过 runTurn 正常执行
- [ ] 所有执行都创建 AgentRun 记录
- [ ] AgentRun 包含完整的执行 trace
- [ ] 现有前端流式功能正常

---

## Phase 4: 工具权限增强

**目标**：实现 Approval Inbox 和项目级权限记忆。

**分支名**：`refactor/phase4-tool-permissions`
**依赖**：Phase 1, Phase 3

### 4.1 新增 Approval 表

```sql
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
```

### 4.2 新增 Permission Memory 表

```sql
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
```

### 4.3 实现 Approval Inbox API

```typescript
// daemon/src/api/approval.ts

// GET /api/approvals - 获取待审批列表
// POST /api/approvals/:id/approve - 批准
// POST /api/approvals/:id/deny - 拒绝
// POST /api/approvals/:id/remember - 记住选择
```

### 4.4 更新 ToolRuntime

- `executeWithPendingConfirmation()` 写入 approval_requests 表
- 新增 `resumeAfterApproval()` 方法恢复被暂停的 AgentRun
- 查询 permission_memories 实现自动决策

### 4.5 实现步骤

1. 创建迁移文件 `008_phase4_tool_permissions.sql`
2. 更新 schema 和 repository
3. 创建 `daemon/src/api/approval.ts` 路由
4. 更新 `daemon/src/runtime/tool-runtime.ts` 集成审批表
5. 创建 `daemon/src/runtime/approval-manager.ts` 管理审批流程
6. 编写单元测试

### 4.6 测试验证

- [ ] 高风险工具触发审批请求
- [ ] 审批请求正确写入数据库
- [ ] 批准后工具正常执行
- [ ] 拒绝后工具不执行
- [ ] "记住选择" 功能正常
- [ ] 后续相同操作自动决策

---

## Phase 5: 项目 UI

**目标**：创建基础的项目管理工作空间界面。

**分支名**：`refactor/phase5-project-ui`
**依赖**：Phase 1, Phase 2

### 5.1 新增前端组件

```
frontend/src/components/workspace/
├── WorkspaceSwitcher.tsx      # 工作空间切换
├── ProjectList.tsx            # 项目列表
├── ProjectCard.tsx            # 项目卡片
├── ProjectDetailView.tsx      # 项目详情
├── TaskBoard.tsx              # 任务看板
├── ConversationList.tsx       # 项目下的对话列表
└── AgentRunTimeline.tsx       # 执行时间线
```

### 5.2 新增 Zustand Store

```typescript
// frontend/src/stores/workspaceStore.ts

interface WorkspaceStore {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  projects: Project[];
  currentProject: Project | null;
  
  // actions
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (id: string) => void;
  loadProjects: (workspaceId: string) => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (data: CreateProjectInput) => Promise<Project>;
}
```

### 5.3 更新 App 路由

```
/                           → 重定向到 /workspace/:id/project/:id
/workspace/:wid             → 工作空间视图
/workspace/:wid/project/:pid → 项目详情
/workspace/:wid/project/:pid/chat → 项目对话
/workspace/:wid/project/:pid/tasks → 项目任务
/workspace/:wid/project/:pid/runs → 执行历史
```

### 5.4 更新现有组件

- `ConversationList` 支持按 project 过滤
- `ChatPanel` 接收 projectId 参数
- `TaskStore` 支持 project 作用域

### 5.5 实现步骤

1. 创建 `frontend/src/components/workspace/` 组件
2. 创建 `frontend/src/stores/workspaceStore.ts`
3. 更新 `frontend/src/App.tsx` 添加路由
4. 更新 `frontend/src/lib/tauri.ts` 添加 IPC 调用
5. 更新后端 API 支持 project 作用域查询
6. 编写组件单元测试

### 5.6 测试验证

- [ ] 工作空间切换正常
- [ ] 项目列表加载和显示正常
- [ ] 创建新项目正常
- [ ] 项目详情页显示正确的对话和任务
- [ ] 项目下的对话正常工作
- [ ] 现有非项目对话不受影响

---

## Phase 6: Task Graph

**目标**：实现任务依赖、状态机和执行追踪。

**分支名**：`refactor/phase6-task-graph`
**依赖**：Phase 1, Phase 3

### 6.1 扩展 tasks 表

```sql
ALTER TABLE tasks ADD COLUMN objective TEXT;
ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN dependencies JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN blocked_by JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN acceptance_criteria JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN artifacts JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN run_history JSON DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN manual_intervention_required BOOLEAN DEFAULT 0;
ALTER TABLE tasks ADD COLUMN rollback_plan TEXT;
```

### 6.2 更新任务状态机

```typescript
type TaskStatus = 
  | 'draft'           // 草稿，待确认
  | 'queued'          // 已确认，等待执行
  | 'running'         // 执行中
  | 'blocked'         // 被阻塞
  | 'failed'          // 执行失败
  | 'completed'       // 已完成
  | 'cancelled';      // 已取消
```

### 6.3 实现依赖解析

```typescript
// daemon/src/task/task-graph.ts

class TaskGraph {
  // 检查任务是否可以执行（所有依赖已完成）
  canExecute(taskId: string): boolean;
  
  // 获取所有可执行的任务
  getExecutableTasks(projectId: string): Task[];
  
  // 标记任务完成，解除依赖
  completeTask(taskId: string): Promise<void>;
  
  // 检测循环依赖
  detectCycles(projectId: string): string[][];
}
```

### 6.4 AI 辅助任务拆解

```typescript
// daemon/src/task/task-decomposer.ts

async function decomposeTask(
  objective: string,
  projectId: string,
  agentId: string
): Promise<TaskDraft[]>;
```

### 6.5 实现步骤

1. 创建迁移文件 `009_phase6_task_graph.sql`
2. 更新 schema 和 repository
3. 创建 `daemon/src/task/task-graph.ts`
4. 创建 `daemon/src/task/task-decomposer.ts`
5. 更新 `daemon/src/api/tasks.ts` 添加依赖相关 API
6. 更新 `daemon/src/runtime/run-executor.ts` 支持任务级执行
7. 编写单元测试

### 6.6 测试验证

- [ ] 任务可以设置依赖关系
- [ ] 依赖未完成时任务状态为 blocked
- [ ] 依赖完成后任务自动变为 queued
- [ ] AI 拆解任务功能正常
- [ ] 任务执行历史正确记录
- [ ] 循环依赖检测正常

---

## 执行流程

每个阶段的执行流程：

```bash
# 1. 从 main 创建新分支
git checkout main
git pull
git checkout -b refactor/phaseN-xxx

# 2. 实现阶段功能
# ... 编写代码 ...

# 3. 测试验证
pnpm test
pnpm build

# 4. 提交并合并到 main
git add .
git commit -m "refactor: Phase N - xxx"
git checkout main
git merge refactor/phaseN-xxx
git push

# 5. 删除特性分支
git branch -d refactor/phaseN-xxx

# 6. 开始下一阶段
git checkout -b refactor/phase(N+1)-xxx
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 数据库迁移失败 | 数据丢失 | 迁移前备份，支持回滚 |
| 现有功能破坏 | 用户体验 | 每阶段完整测试，保持向后兼容 |
| conversation.ts 重构引入 bug | 聊天功能不可用 | 渐进式重构，保留旧路径作为 fallback |
| 前端状态管理复杂度增加 | 维护成本 | Zustand store 按功能拆分，保持单一职责 |
| 性能下降 | 响应变慢 | 关键路径添加性能测试，必要时添加索引 |

---

## 验收标准

每个阶段完成后，需要满足：

1. **功能验收**：所有新增功能正常工作
2. **回归测试**：现有功能不受影响
3. **性能验收**：关键操作响应时间在可接受范围
4. **代码质量**：通过 ESLint/Prettier 检查
5. **文档更新**：相关文档已更新
6. **测试覆盖**：新增代码测试覆盖率 >= 80%

---

## 参考文档

- [Agent OS 产品愿景](./agent-os-product-vision.md)
- [当前架构文档](../ARCHITECTURE.md)
- [数据库 Schema](../../daemon/src/db/schema.ts)
- [Agent Loop 实现](../../daemon/src/orchestrator/conversation.ts)
