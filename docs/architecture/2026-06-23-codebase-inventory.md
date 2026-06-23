# Codebase Inventory - Agent-Native Execution Architecture

Date: 2026-06-23
Session: 0 (Inventory Only)
Goal: Map current codebase to target architecture without changing behavior.

## 1. Current Module Map

### Workspace Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/persistence/schema.ts` | DB schema (Drizzle) | `workspaces`, `workspaceAgents`, `workspaceSpecs`, `workspaceMemories` |
| `daemon/src/persistence/sqlite/workspace-repo.ts` | Workspace repository | `createWorkspace`, `getWorkspace`, `listWorkspaces`, `updateWorkspace`, `deleteWorkspace` |
| `daemon/src/services/workspace-orchestrator.ts` | Goal-to-workspace pipeline | `orchestrateFromGoal()` |
| `daemon/src/services/workspace-detail.ts` | Aggregated workspace view | `getWorkspaceDetail()` |
| `daemon/src/services/workspace-event-emitter.ts` | Structured event emission | `emitWorkspaceEvent()` |
| `daemon/src/services/workspace-verification.ts` | Verification events | `emitVerificationEvent()` |
| `daemon/src/http/routes/workspaces.ts` | Workspace REST API | CRUD + `/from-goal` + `/agents` + `/artifacts` |

### Task Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/persistence/schema.ts` | DB schema | `tasks`, `taskDependencies` |
| `daemon/src/http/routes/tasks.ts` | Task REST API | CRUD + `/decompose` + `/start` + `/cancel` + dependency graph |
| `daemon/src/workspaces/task-graph-service.ts` | Task graph operations | Dependency resolution, cycle detection, executable task queries |

### Run Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/persistence/schema.ts` | DB schema | `agentRuns`, `runEvents` |
| `daemon/src/http/routes/runs.ts` | Run REST API | CRUD + `/cancel` + `/retry` + `/message` |
| `daemon/src/workflow/run-dispatcher.ts` | Dispatch loop | `dispatchRuns()`, `completeRun()`, `cancelRun()`, `retryRun()` |

### Agent Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/persistence/schema.ts` | DB schema | `agentProfiles` |
| `daemon/src/services/agent-broker.ts` | Agent selection | `proposeTeam()` |
| `daemon/src/http/routes/agent-profiles.ts` | Agent profile CRUD + test | CRUD + `POST /:id/test` |
| `daemon/src/http/routes/agent-broker.ts` | Team proposal | `POST /propose-team` |

### Approval Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/persistence/schema.ts` | DB schema | `approvalRequests` |
| `daemon/src/http/routes/approval.ts` | Approval REST API | approve/deny/remember/batch/expire |
| `daemon/src/capabilities/` | Permission/capability system | `OSCapabilityBroker`, `InteractionBroker`, `ExecutionPolicy` |

### Coding Runtime Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `daemon/src/runtimes/coding/registry.ts` | Adapter registry | `registerDefaults()`, `getCodingRuntime()`, `createCodingRun()` |
| `daemon/src/runtimes/coding/process-spawner.ts` | Process management | `spawnProcess()`, `spawnProcessLive()`, `killProcessTree()` |
| `daemon/src/runtimes/coding/types.ts` | Shared types | `CodingAgentAdapter`, `CodingTask`, `CodingRunHandle`, etc. |
| `daemon/src/runtimes/coding/artifact-persistence.ts` | Artifact storage | Artifact collection and persistence |
| `daemon/src/runtimes/coding/adapters/claude-code/cli-adapter.ts` | Claude Code adapter | `ClaudeCodeCliAdapter` |
| `daemon/src/runtimes/coding/adapters/codex/cli-adapter.ts` | Codex adapter | `CodexCliAdapter` |
| `daemon/src/runtimes/coding/adapters/opencode/cli-adapter.ts` | OpenCode adapter | `OpenCodeCliAdapter` |

---

## 2. Executor Launch Paths

### Production Launch Paths (Through Abstraction)

| # | Entry Point | File | How It Launches |
|---|-------------|------|-----------------|
| 1 | `startRun()` | `adapters/claude-code/cli-adapter.ts:69` | `spawnProcessLive()` via `spawnClaude()` |
| 2 | `startRun()` | `adapters/codex/cli-adapter.ts:58` | `spawnProcessLive()` via `spawnCodex()` |
| 3 | `startRun()` | `adapters/opencode/cli-adapter.ts:59` | `spawnProcessLive()` via `spawnOpenCode()` |
| 4 | `dispatchRuns()` | `workflow/run-dispatcher.ts:32` | Calls `adapter.createRun()` -> `startRun()` |
| 5 | `orchestrateFromGoal()` | `services/workspace-orchestrator.ts:72` | Enqueues tasks -> dispatcher picks up -> adapter |

### Direct Launch Paths (Bypass Adapter Abstraction)

| # | Entry Point | File | How It Launches | Risk |
|---|-------------|------|-----------------|------|
| 6 | `POST /coding/:id/dry-run` | `http/routes/runtimes.ts:190` | `spawnProcess()` directly with inline CLI args | Medium - diagnostic only |
| 7 | `POST /:id/test` | `http/routes/agent-profiles.ts:310` | `spawnProcess()` directly with temp dir + git init | Medium - diagnostic only |

### Indirect/Notable Process Spawning

| # | Entry Point | File | What It Does |
|---|-------------|------|--------------|
| 8 | `orchestrateFromGoal()` | `services/workspace-orchestrator.ts:166-177` | `execSync` for `git init`, `git config`, `git add/commit` |
| 9 | `discover()` | Each adapter's `discover()` method | `execFileSync` for `--version` check |
| 10 | Verification commands | Each adapter's `runVerification()` | `execFileSync("sh", ["-c", cmd])` post-success |

### Skeleton/Unused

| # | Entry Point | File | Status |
|---|-------------|------|--------|
| 11 | `delegate()` | `external-agent/local-cli-adapter.ts:104` | Skeleton - returns pending, no actual spawn |

---

## 3. Policy Bypass Paths

### Shell/File/Network Policy Gaps

| File | Bypass | Severity |
|------|--------|----------|
| `http/routes/runtimes.ts:190` | Dry-run spawns process without going through adapter's `OSCapabilityBroker.requestShellExec()` | Medium |
| `http/routes/agent-profiles.ts:310` | Test spawns process, creates temp dir, runs `git init` without policy checks | Medium |
| `services/workspace-orchestrator.ts:166-177` | `execSync` for git operations without capability broker | Low - internal setup |
| Each adapter's `runVerification()` | `execFileSync("sh", ["-c", cmd])` post-success without policy | Low - post-completion |

### Direct Database Access (Bypassing Repository Layer)

| File | Tables Accessed Directly | Severity |
|------|-------------------------|----------|
| `routes/workspaces.ts` (lines 169, 186-195, 203) | `workspaceAgents`, `artifacts` | Medium |
| `routes/settings-usage.ts` (lines 42-81) | `conversations` (analytics) | Low |
| `services/agent-broker.ts` (line 30-34) | `agentProfiles` | Medium |
| `services/workspace-detail.ts` (lines 62-222) | `workspaces`, `workspaceAgents`, `tasks`, `projects`, `agentRuns`, `approvalRequests` | High |
| `services/workspace-orchestrator.ts` (lines 248-268, 549-556) | `workspaceAgents`, `artifacts` | Medium |

### MCP Policy Gaps

| Observation | Detail |
|-------------|--------|
| MCP server management | CRUD in `routes/mcp.ts` - no per-executor scoping |
| MCP tool calls | Proxied directly via `POST /servers/:id/tools/:toolName` - no executor-level gating |
| No MCP config generation per executor | Each adapter manages its own MCP config independently |

---

## 4. Legacy API Candidates

### Strong Legacy Candidates (Expose Implementation Details)

| Endpoint | File | Reason |
|----------|------|--------|
| `POST /api/runs/:id/message` | `routes/runs.ts` | Direct agent loop steering |
| `GET /api/queue/*` | `routes/queue.ts` | Internal queue/slot/resource exposure |
| `GET /api/runtimes/coding/*` | `routes/runtimes.ts` | Adapter discovery + dry-run spawning |
| `GET /api/runtime/components` | `routes/runtime.ts` | Daemon internals |
| `POST /api/runtime/shutdown` | `routes/runtime.ts` | Infrastructure control |
| `POST /api/tools/:id/execute` | `routes/tools.ts` | Direct tool execution |
| `GET /api/tools/pending-confirmations` | `routes/tools.ts` | Permission guard internals |
| `POST /api/tools/confirm/:id` | `routes/tools.ts` | Permission guard internals |
| `POST /api/tasks/decompose` | `routes/tasks.ts` | Direct LLM decomposition (duplicated in orchestrator) |
| `GET /api/tasks/:id/can-execute` | `routes/tasks.ts` | Task graph internals |
| `GET /api/tasks/project/:projectId/cycles` | `routes/tasks.ts` | Task graph internals |
| `POST /api/agent-profiles/:id/test` | `routes/agent-profiles.ts` | Direct process spawning with temp dirs |
| `POST /api/voice/realtime-session` | `routes/voice.ts` | OpenAI proxy |
| `POST /api/chat/debug/context` | `routes/chat.ts` | Direct ContextBuilder construction |
| `GET /api/settings/db-manager/*` | `routes/settings.ts` | Raw table management |

### High-Level APIs (Should Remain)

| Endpoint | File | Reason |
|----------|------|--------|
| `POST /api/workspaces/from-goal` | `routes/workspaces.ts` | Canonical orchestration entry |
| `GET /api/workspaces/:id/detail` | `routes/workspaces.ts` | Aggregated workspace view |
| `POST /api/conversations/:id/messages` | `routes/conversations.ts` | Primary user interaction |
| `POST /api/chat` + `/stream` | `routes/chat.ts` | Convenience chat |
| `POST /api/approvals/:id/approve\|deny` | `routes/approval.ts` | Security gate |
| Entity CRUD (projects, articles, memories, etc.) | Various | Data management |
| `POST /api/voice/converse-stream` | `routes/voice.ts` | Voice conversation |

---

## 5. Target Architecture Mapping

### Current -> Target Alignment

| Target Component | Current Implementation | Gap |
|-----------------|----------------------|-----|
| `Goal` intake | `POST /workspaces/from-goal` | Exists, but Goal not persisted as entity |
| `Planner` | Inline in `workspace-orchestrator.ts` | Not extracted as separate service |
| `TaskGraph` | `task-graph-service.ts` + `tasks` table | Exists, but no persistent Plan entity |
| `Agent/Executor Broker` | `agent-broker.ts` + `registry.ts` | Exists, rule-based selection |
| `Sandbox Runtime` | Not implemented | **Major gap** - no sandbox abstraction |
| `Managed Executor` | `CodingAgentAdapter` + adapters | Partial - no unified `ExecutorAdapter` interface |
| `Artifact Store` | `artifact-persistence.ts` + `artifacts` table | Exists, basic |
| `Verifier/Reviewer` | `workspace-verification.ts` | Minimal - only event emission |
| `Delivery Composer` | Not implemented | **Major gap** |
| `Permission Policy` | `OSCapabilityBroker` + `approvalRequests` | Exists but not plan-scoped |
| `Event Sourcing` | `runEvents` table + event emitter | Partial - missing many event types |

### Missing Domain Objects (Not Yet Implemented)

- `ExecutorAdapter` (unified interface)
- `ExecutorRun` (separate from `AgentRun`)
- `SandboxSession`
- `SandboxRuntime`
- `Plan` (persistent)
- `Goal` (persistent entity)
- `VerificationResult` (structured)
- `PermissionGrant` (plan-scoped)
- `DeliveryGate`

---

## 6. Verification

- [x] No production behavior changes (inventory only)
- [x] Manual review of code references completed
- [x] All findings documented above
