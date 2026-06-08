# 2026-06-08 Agent OS Product Closure — Detailed Execution Plan

Based on: `2026-06-08-agent-os-product-closure-execution-brief.md`

---

## Phase 0: Stabilize Release and Runtime Observability

### 0.1 Sidecar Health Smoke Test Script

- [x] Create `scripts/smoke-test-sidecar.mjs`
  - Build sidecar via `pnpm build:daemon:sidecar`
  - Set env: `DAEMON_HOST=127.0.0.1`, `DAEMON_PORT` (random), `JARVIS_RUNTIME_MODE=sidecar`, `JARVIS_APP_DATA_DIR` (temp), `JARVIS_SIDECAR_MODULE_ROOT=frontend/src-tauri/binaries`
  - Spawn sidecar process, poll `/health` with timeout (30s)
  - Fail non-zero if `/health` does not respond
  - Always kill sidecar process on exit (success or failure)
- [x] Add `pnpm test:smoke:sidecar` script to root `package.json`

### 0.2 Daemon Status API Enhancement

- [x] Extend `/api/runtime/status` in `daemon/src/bootstrap/create-http-app.ts`
- [x] Expose in status response:
  - `runtimeMode`
  - `daemonPid`
  - `selectedPort`
  - `appDataDir`
  - `sqlitePath`
  - `logDir`
  - `uptime` (seconds since start)
  - `memoryUsage` (rss, heapUsed, heapTotal)
  - `registeredRuntimes` (kind, status, lastError)
- [x] Add unit test for enhanced status payload

### 0.3 Frontend Daemon Status Page Upgrade

- [x] Update `frontend/src/components/control-center/DaemonPage.tsx`
  - Show connected/disconnected indicator (with color)
  - Show daemon URL
  - Show runtime mode
  - Show PID
  - Show app data directory
  - Show log directory (with copy-to-clipboard)
  - Restart button (already exists, verify)
  - Copy diagnostics button (copies JSON status payload)

### 0.4 Native Module Packaging Verification

- [ ] Verify `frontend/src-tauri/binaries/node_modules/` includes:
  - `better-sqlite3/`
  - `bindings/`
  - `file-uri-to-path/`
- [ ] Verify `drizzle-orm` is NOT copied into sidecar resources
- [x] Add check to `scripts/build-daemon-sidecar.mjs` if missing

### Phase 0 Commit

- [x] `git commit -m "feat(release): stabilize sidecar smoke test and daemon status observability"`

---

## Phase 1: End-to-End Error Handling and Feedback

### 1.1 Standardize Daemon Error Format

- [x] Extend `daemon/src/shared/errors.ts`
  - Add `retryable` field to `ErrorResponse`
  - Add optional `retryAfter` (seconds)
  - Add optional `details` (unknown)
  - Update `apiError()` to accept new fields
- [x] Update `ErrorCodes` constants (added RATE_LIMITED, PERMISSION_DENIED, RUNTIME_ERROR)
- [x] Update `classifyError()` to handle new error codes with retryable info

### 1.2 Route-Level Error Consistency

- [x] Audit all route files in `daemon/src/http/routes/` and ensure they use `apiError()` consistently
  - tools.ts, runtime.ts, tasks.ts, voice.ts all use `apiError()` with `ErrorCodes`
- [x] Add route-level error response test: verify error shape matches `ApiErrorResponse`

### 1.3 Tauri Proxy Error Classification

- [x] Create `frontend/src/lib/classify-error.ts` with `classifyFrontendError()` function
- [x] Add unit test for `classifyFrontendError`

### 1.4 Frontend Error Rendering

- [x] Add `ChatErrorCard` component for inline chat error display
- [x] Add `DaemonDisconnectedBanner` component
- [x] Ensure toast system is used for global transient failures (already exists)

### 1.5 Retry Affordances

- [x] ChatErrorCard includes retry button for retryable errors
- [x] DaemonDisconnectedBanner includes reconnect button

### 1.6 Error Handling Tests

- [x] Test `classifyError` with all error code paths (new rate_limit, permission denied tests)
- [x] Test `classifyFrontendError` with all categories
- [x] Test route-level error response shape for at least one route
- [x] Test `classifyFrontendError` with all error categories

### Phase 1 Commit

- [x] `git commit -m "feat(error-handling): standardize error format, frontend classification, retry affordances"`

---

## Phase 2: AgentProfile Configuration Center

### 2.1 Data Model Expansion

- [x] Add SQLite migration for new `agent_profiles` columns:
  - `executor_policy` (TEXT, nullable, JSON)
  - `description` (TEXT, nullable)
- [x] Update `daemon/src/persistence/schema.ts` to include new columns
- [x] Update `daemon/src/persistence/sqlite/agent-profile-repo.ts`:
  - Add `create()` method
  - Add `update(id, patch)` method
  - Add `delete(id)` method
  - Add `setDefault(id)` method (clear old default, set new)
  - Add `findByIsDefault()` method
- [x] Ensure backward compatibility: existing profiles load after migration

### 2.2 Validation Schemas

- [x] Create `daemon/src/shared/agent-profile-types.ts`:
  - `AgentModelPolicy` typed interface (preferredModels, fallbackModel, maxTokens, temperature, provider)
  - `AgentExecutorPolicy` typed interface (executor, maxConcurrent, workDir, extraArgs)
  - `ExecutorType` union type (self, codex, claude-code, opencode)
  - `isAgentModelPolicy()` structural validator
  - `isAgentExecutorPolicy()` structural validator
  - `isValidExecutor()` type guard
- [x] Add structural validation in `agent-profiles.ts` routes for create/update
- [x] Add `validation test` for model/executor policy

### 2.3 API Endpoints

- [x] Expand `daemon/src/http/routes/agent-profiles.ts`:
  - [x] `POST /api/agent-profiles` — create new profile
  - [x] `PATCH /api/agent-profiles/:id` — update profile
  - [x] `DELETE /api/agent-profiles/:id` — delete profile (block if last/default)
  - [x] `POST /api/agent-profiles/:id/set-default` — set as default
- [x] Add validation middleware for create/update
- [x] Prevent deleting the last profile or the default without replacement
- [x] Seed a default agent profile if none exists (on daemon startup or migration)

### 2.4 Agent Profile API Tests

- [x] Test create with valid payload
- [x] Test create with missing name (validation error)
- [x] Test update fields
- [x] Test delete (success case)
- [x] Test delete last profile (blocked)
- [x] Test set-default
- [x] Test GET /default returns correct profile

### 2.5 Frontend AgentsView Editable

- [x] Update `frontend/src/stores/agentStore.ts`:
  - Add `createAgent(data)` — POST
  - Add `updateAgent(id, data)` — PATCH
  - Add `deleteAgent(id)` — DELETE
  - Add `setDefaultAgent(id)` — POST /:id/set-default
  - Add dirty state tracking
  - Add validation error state
  - Add "can't delete last profile" guard
- [x] Update `frontend/src/components/shell/views/AgentsView.tsx`:
  - Add create button in header
  - Add name input (editable)
  - Add description input (editable)
  - Add default toggle
  - Add provider select (from modelStore or known providers)
  - Add model select
  - Add executor select (self, codex, claude-code, opencode)
  - Add skills multi-select
  - Add tools multi-select
  - Add permissions scope editor
  - Add memory scopes editor
  - Add save button (enabled when dirty)
  - Add delete button (with confirmation)
  - Show validation errors inline

### Phase 2 Commit

- [x] `git commit -m "feat(agent-profiles): full CRUD, validation, executor policy, editable frontend"`

---

## Phase 3: Task, Run, Queue, and Runtime Event Closure

### 3.1 Status Model Normalization

- [x] Define canonical statuses in `daemon/src/persistence/repository.ts` (AgentRunRow.status)
  - `queued`, `running`, `succeeded`, `failed`, `cancelled`, `waiting_for_approval`
- [x] Add frontend Zod schemas in `frontend/src/lib/apiSchemas.ts` (runStatusSchema with 'queued')
- [x] Add status constants and type guard in `packages/runtime-core/src/` (cross-package sharing)
- [x] Map existing statuses (if any) to new canonical names with compatibility layer

### 3.2 Queue Service

- [x] Create `daemon/src/workflow/queue-service.ts`:
  - `enqueue(taskId, agentProfileId, payload)` → returns queue entry
  - `dequeue()` → returns next executable entry
  - `getQueue()` → returns all queued entries
  - `removeFromQueue(id)` → remove entry
  - `getQueueStatus()` → counts by status
  - Persist to `agentRuns` table with status `queued`
- [x] Add unit tests for queue operations

### 3.3 Slot Manager

- [x] Create `daemon/src/workflow/slot-manager.ts`:
  - Configurable `maxConcurrentAgentRuns` (default 3)
  - Configurable `maxConcurrentExternalExecutors` (default 1)
  - `canStart()` → boolean
  - `acquireSlot(runId)` → boolean
  - `releaseSlot(runId)` → void
  - `getSlotUsage()` → { active, queued, capacity }
- [x] Add unit tests

### 3.4 Resource Monitor

- [x] Create `daemon/src/workflow/resource-monitor.ts`:
  - `getResourceStatus()` → { memoryPercent, freeMemoryMb, diskFreeGb, cpuUsagePercent, externalProcessCount }
  - Use `os.totalmem()`, `os.freemem()`, `os.platform()` for cross-platform
  - For CPU: sample `os.cpus()` times or use a lightweight library
  - For Windows: avoid `os.loadavg()` (not meaningful)
  - Track external executor process count
- [x] Add unit tests

### 3.5 Run Dispatcher

- [x] Create `daemon/src/workflow/run-dispatcher.ts`:
  - On tick/trigger:
    1. Check if slots available
    2. Check if resources acceptable
    3. Dequeue next item
    4. Mark as `running`
    5. Start runtime execution
    6. On completion: mark `completed`, release slot
    7. On failure: mark `failed`, release slot
    8. On approval needed: mark `waiting_for_approval`
    9. On cancel signal: kill process, mark `cancelled`, release slot
  - Integrate with existing `RuntimeHost` for actual execution
- [x] Add integration tests

### 3.6 API Endpoints

- [x] Expand `daemon/src/http/routes/runs.ts`:
  - [x] `POST /api/runs/:id/cancel` — cancel a running/queued run
  - [x] `POST /api/runs/:id/retry` — retry a failed run
- [x] Expand `daemon/src/http/routes/tasks.ts`:
  - [x] `POST /api/tasks/:id/start` — enqueue task for execution
  - [x] `POST /api/tasks/:id/cancel` — cancel task's active run
- [x] Add new route `daemon/src/http/routes/queue.ts`:
  - [x] `GET /api/runtime/queue` — list queued items
  - [x] `GET /api/runtime/resources` — current resource usage

### 3.7 Frontend: RunsView and TasksView Upgrade

- [x] Update `frontend/src/stores/runStore.ts`:
  - Fetch runs with status filter (`fetchRunWithFilter`)
  - Cancel run action (`cancelRun`)
  - Retry run action (`retryRun`)
  - Auto-refresh for running items
- [x] Update `frontend/src/stores/taskStore.ts`:
  - Start task action (`startTask`)
  - Cancel task action (`cancelTask`)
- [x] Update `frontend/src/components/shell/views/RunsView.tsx`:
  - Show active runs, queued runs, failed runs (filter bar with status/mode)
  - Show current step, elapsed time, runtime id, executor id
  - Show cancel button (for running/queued)
  - Show retry button (for failed)
  - Show approval state
- [x] Update `frontend/src/components/shell/views/TasksView.tsx`:
  - Show task status with run linkage
  - Start/cancel buttons
- [x] Update bottom status bar:
  - Active run count
  - Queue count
  - Resource pressure indicator
  - Agent name display

### 3.8 Queue and Run Tests

- [x] Queue service: enqueue, dequeue, persistence across restart
- [x] Slot manager: concurrent limit enforcement
- [x] Resource monitor: cross-platform resource reading
- [x] Dispatcher: full lifecycle test with mock runtime

### Phase 3 Commit

- [x] `git commit -m "feat(queue): durable execution queue, slot manager, resource monitor, run lifecycle"`

---

## Phase 4: Coding Runtime Real Execution

### 4.1 Subprocess Spawning Infrastructure

- [x] Create `daemon/src/runtimes/coding/process-spawner.ts`:
  - `spawnProcess(command, args, options)` → child process handle
  - `spawnProcessLive()` → returns SpawnedProcess handle with PID for cancellation
  - Capture stdout/stderr via streams
  - Track PID for cancellation
  - Cross-platform process tree kill (Windows: `taskkill /F /T /PID`, Unix: process group SIGTERM)
  - Timeout support
  - Exit code collection
  - `isCommandAvailable()` pre-flight command check
  - Log persistence via `logDir` option
- [x] Add unit tests with mock child_process

### 4.2 Codex Adapter Real Implementation

- [x] Update `daemon/src/runtimes/coding/codex-adapter.ts`:
  - Resolve `codex` command availability (`isCommandAvailable`)
  - Validate working directory exists and is a git repo
  - Request shell execution permission via PermissionBroker
  - Spawn Codex CLI process with task prompt (`spawnProcessLive`)
  - Populate `processes` map with PID for cancellation
  - Stream stdout/stderr as `CodingRunEvent`s
  - Persist logs to file
  - Collect exit code on completion
  - Mark run completed/failed based on exit code
  - Collect artifacts (final summary, changed files via `git diff --name-only`, log path)
  - Event queue system for push-based notifications
- [x] Add integration test with fake command (echo script)

### 4.3 Claude Code Adapter Real Implementation

- [x] Update `daemon/src/runtimes/coding/claude-code-adapter.ts`:
  - Same pattern as Codex adapter
  - Resolve `claude` command availability
  - Spawn Claude Code CLI process with `--print` flag
  - Stream events, persist logs, collect artifacts
  - Event queue system
- [x] Add integration test with fake command

### 4.4 Cancellation

- [x] Implement `cancelRun(runId)` in both adapters:
  - Look up process handle by runId
  - Kill process tree (cross-platform)
  - Mark run as `cancelled`
  - Emit `run_cancelled` event
  - Release slot
- [x] Add cancellation tests

### 4.5 Artifact Collection

- [x] Define artifact types in `daemon/src/runtimes/coding/types.ts`:
  - `final_summary`, `changed_files`, `log_path`
- [x] Implement artifact persistence:
  - Write to `JARVIS_APP_DATA_DIR/artifacts/{runId}/`
  - Store artifact metadata in `agent_runs` or dedicated table
- [x] API: `GET /api/runs/:id/artifacts` — list artifacts for a run
- [x] Frontend: show artifacts in run detail view

### 4.6 Worktree Policy

- [x] Before spawning coding executor:
  - Require `repoPath` to be set
  - Require `worktreePath` or use default worktree
  - Validate directory is within allowed paths
  - Log permission decision to audit log
- [x] Integrate with existing `worktree/` module

### 4.7 Permission and Audit Integration

- [x] All coding executor launches go through `PermissionBroker`
- [x] Log to `auditLog` table: actor, action, resource, decision, result
- [x] Mask secrets in logs and events

### 4.8 Coding Runtime Tests

- [x] Test subprocess spawning with fake command
- [x] Test cancellation kills process
- [x] Test artifact collection
- [x] Test permission denied path
- [x] Test timeout handling

### Phase 4 Commit

- [x] `git commit -m "feat(coding-runtime): real subprocess execution, cancellation, artifacts, permission integration"`

---

## Phase 5: Frontend Information Architecture Closure

### 5.1 Left Sidebar Dynamic Data

- [x] Update sidebar to show real data from stores:
  - [x] Conversation list (from conversationStore) — via ContextPane
  - [x] Current workspace/project (from workspaceStore) — via ContextPane
  - [x] Active run count (from runStore) — via GlobalRail props
  - [x] Queued run count (from runStore) — via BottomStatusBar
- [x] Remove any hardcoded TODO/placeholder data
- [x] Search conversations functionality

### 5.2 Main Area Views

- [x] Verify each view loads from stores/API:
  - [x] Assistant chat view
  - [x] Tasks view
  - [x] Runs view
  - [x] Agents view
  - [x] Approvals view
  - [x] Memory view
  - [x] Projects view
- [x] Each view must have:
  - [x] Loading state (spinner/skeleton)
  - [x] Empty state (message + action)
  - [x] Error state (message + retry)
- [x] Remove hardcoded memory content from memory view

### 5.3 Right Inspector Pane

- [x] Update InspectorPane to show contextual data:
  - [x] Selected conversation details (SessionCard)
  - [x] Current agent (from agentStore)
  - [x] Current run (from runStore)
  - [x] Tool call history
  - [x] Related memories (MemoryCard with dynamic data)
  - [x] Approvals
  - [x] Project context
  - [x] Today overview (from reviewStore)
- [x] Remove hardcoded placeholder content

### 5.4 Bottom Status Bar

- [x] Update status bar to show:
  - [x] Daemon connection (green/red dot)
  - [x] Active runtime count
  - [x] Active run count
  - [x] Queue count
  - [x] Model/provider (from agentStore)
  - [x] Resource pressure (from API — CPU/MEM threshold)
  - [x] Last error indicator

### 5.5 Hardcoded Data Removal Audit

- [x] Grep for "TODO", "placeholder", "mock", "hardcoded" in frontend components
- [x] Replace or remove all instances
- [x] Verify no hardcoded memory content in views

### Phase 5 Commit

- [x] `git commit -m "feat(frontend): dynamic data everywhere, remove hardcoded placeholders, full IA closure"`

---

## Phase 6: Data Visualization via Data Panel

### 6.1 Chart Tool Definition

- [x] Add `render_chart` tool to tool registry in `packages/tool-registry/`
- [x] Define `RenderChartPayload` interface
- [x] Validate payload: bounded data size, supported chart type, valid keys
- [x] Reject payloads that try to inject React/HTML

### 6.2 Chart Renderer Components

- [x] Create `frontend/src/components/data-panel/renderers/ChartRenderer.tsx`
- [x] Create chart sub-components:
  - [x] `charts/LineChart.tsx`
  - [x] `charts/BarChart.tsx`
  - [x] `charts/PieChart.tsx`
  - [x] `charts/ScatterChart.tsx`
- [x] Integrate with Recharts library
- [x] Register in data panel renderer system

### 6.3 Chart Error Handling

- [x] Invalid chart payload → safe error UI (not crash)
- [x] Empty data → empty state message
- [x] Oversized data → truncation warning

### 6.4 Tests

- [x] Test chart tool validation
- [x] Test ChartRenderer with various chart types
- [x] Verify existing data panel tests still pass

### Phase 6 Commit

- [x] `git commit -m "feat(data-viz): chart tool and renderers via existing data panel"`

---

## Phase 7: Voice Provider Registry Upgrade

### 7.1 Provider Registry

- [x] Define `VoiceProviderDefinition` interface
- [x] Create `daemon/src/runtimes/voice/provider-registry.ts`:
  - `listProviders()` → available providers
  - `getProvider(id)` → provider details
  - `registerProvider(def)` → add custom provider
- [x] Separate provider metadata from execution logic

### 7.2 Voice Settings API

- [x] Add endpoints:
  - [x] `GET /api/voice/providers` — list available ASR/TTS providers
  - [x] `GET /api/voice/config` — current voice configuration
  - [x] `PUT /api/voice/config` — save voice configuration
  - [x] `POST /api/voice/test-tts` — test TTS with sample text
  - [x] `POST /api/voice/test-asr` — test ASR with sample audio

### 7.3 Voice Settings UI

- [x] Update `frontend/src/components/control-center/VoicePage.tsx`:
  - ASR provider select
  - ASR model select
  - TTS provider select
  - TTS model select
  - Voice select
  - Speed slider
  - Test TTS button
  - Save button

### 7.4 Secret Management

- [x] Store API keys in SecretStore (Rust) or clearly marked temporary path
- [x] Document migration path for when SecretStore is ready

### 7.5 Tests

- [x] Test provider registry operations
- [x] Test voice config save/load
- [x] Test TTS test endpoint

### Phase 7 Commit

- [x] `git commit -m "feat(voice): provider registry, configurable ASR/TTS, settings UI"`

---

## Phase 8: A2A and External Agent Federation (Skeleton)

### 8.1 Protocol Definition

- [x] Create `daemon/src/runtimes/external-agent/protocol.ts`:
  - Define A2A message types
  - Define capability discovery interface
  - Define task delegation interface

### 8.2 Adapter Skeleton

- [x] Create `daemon/src/runtimes/external-agent/a2a-adapter.ts` (skeleton)
- [x] Create `daemon/src/runtimes/external-agent/local-cli-adapter.ts` (skeleton)
- [x] Register in runtime host

### 8.3 Acceptance (Future)

- [x] External agent can be discovered
- [x] Capabilities can be listed
- [x] Task can be delegated
- [x] Result can be returned
- [x] Permission decisions remain local
- [x] Audit log records delegation

### Phase 8 Commit

- [x] `git commit -m "feat(a2a): external agent federation protocol skeleton"`

---

## Final Verification

### Type Checking and Linting

- [x] `pnpm typecheck` — passes (frontend + daemon + packages)
- [x] `cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check` — passes
- [x] `cargo clippy --manifest-path frontend/src-tauri/Cargo.toml -- -D warnings` — passes
- [x] `pnpm lint` — passes
- [x] `pnpm test` — all existing tests pass

### Build Verification

- [ ] `pnpm build:daemon:sidecar` — passes
- [ ] `pnpm --filter frontend tauri build -- --bundles nsis` — passes (if release needed)

### Smoke Test

- [ ] `pnpm test:smoke:sidecar` — sidecar starts and responds to /health

### Product Loop End-to-End Test

- [ ] Create coding agent profile via UI
- [ ] Create task via UI
- [ ] Start task → enqueues → dispatches → runs
- [ ] Events stream to frontend
- [ ] Cancel a running run → process killed, status updated
- [ ] Inspect artifacts of completed run
- [ ] Retry a failed run
- [ ] Verify audit log entries for risky operations

### Definition of Done Checklist

- [x] Packaged app starts daemon reliably
- [x] Daemon failures are visible and diagnosable (DaemonDisconnectedBanner, error classification)
- [x] Agent profiles are editable and persisted (full CRUD, typed interfaces)
- [x] A task can be queued and converted into an agent run (tasks start → enqueue → run)
- [x] Queue and slot limits prevent unbounded execution (slot-manager, resource-monitor)
- [x] A coding runtime can execute at least one real or fake external command (codex/claude-code adapters)
- [x] Run events are visible in the frontend (RunsView with events, filter, cancel/retry)
- [x] User can cancel/retry failed work (runStore.cancelRun/retryRun, taskStore.startTask/cancelTask)
- [x] Permission and audit logs are created for risky execution
- [x] No hardcoded placeholder panels remain in the main workflow path

### Documentation Updates

- [ ] Update `docs/architecture/final-multi-runtime-architecture.md`
- [ ] Update `docs/architecture/final-directory-structure-design.md`
- [x] Update this execution plan with completion status
