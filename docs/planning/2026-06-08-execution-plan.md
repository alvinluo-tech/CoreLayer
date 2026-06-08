# 2026-06-08 Agent OS Product Closure — Detailed Execution Plan

Based on: `2026-06-08-agent-os-product-closure-execution-brief.md`

---

## Phase 0: Stabilize Release and Runtime Observability

### 0.1 Sidecar Health Smoke Test Script

- [ ] Create `scripts/smoke-test-sidecar.mjs`
  - Build sidecar via `pnpm build:daemon:sidecar`
  - Set env: `DAEMON_HOST=127.0.0.1`, `DAEMON_PORT` (random), `JARVIS_RUNTIME_MODE=sidecar`, `JARVIS_APP_DATA_DIR` (temp), `JARVIS_SIDECAR_MODULE_ROOT=frontend/src-tauri/binaries`
  - Spawn sidecar process, poll `/health` with timeout (30s)
  - Fail non-zero if `/health` does not respond
  - Always kill sidecar process on exit (success or failure)
- [ ] Add `pnpm test:smoke:sidecar` script to root `package.json`

### 0.2 Daemon Status API Enhancement

- [ ] Extend `daemon/src/http/routes/runtime.ts` (or create new `daemon-status.ts` route)
- [ ] Expose in status response:
  - `runtimeMode`
  - `daemonPid`
  - `selectedPort`
  - `appDataDir`
  - `sqlitePath`
  - `logDir`
  - `uptime` (seconds since start)
  - `memoryUsage` (rss, heapUsed, heapTotal)
  - `registeredRuntimes` (kind, status, restartCount)
  - `lastStartupError` (nullable)
- [ ] Add unit test for enhanced status payload

### 0.3 Frontend Daemon Status Page Upgrade

- [ ] Update `frontend/src/components/control-center/DaemonPage.tsx`
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
- [ ] Add check to `scripts/build-daemon-sidecar.mjs` if missing

### Phase 0 Commit

- [ ] `git commit -m "feat(release): stabilize sidecar smoke test and daemon status observability"`

---

## Phase 1: End-to-End Error Handling and Feedback

### 1.1 Standardize Daemon Error Format

- [ ] Extend `daemon/src/shared/errors.ts`
  - Add `retryable` field to `ErrorResponse`
  - Add optional `retryAfter` (seconds)
  - Add optional `details` (unknown)
  - Update `apiError()` to accept new fields
- [ ] Update `ErrorCodes` constants if needed (add RATE_LIMITED, PERMISSION_DENIED)
- [ ] Update `classifyError()` to handle new error codes

### 1.2 Route-Level Error Consistency

- [ ] Audit all route files in `daemon/src/http/routes/` and ensure they use `apiError()` consistently:
  - [ ] conversations
  - [ ] chat
  - [ ] tasks
  - [ ] runs
  - [ ] agent-profiles
  - [ ] tools
  - [ ] mcp
  - [ ] voice
  - [ ] runtime
  - [ ] approvals
- [ ] Add route-level error response test: verify error shape matches `ApiErrorResponse`

### 1.3 Tauri Proxy Error Classification

- [ ] Update `frontend/src/lib/` or Tauri invoke wrapper to classify errors:
  - `daemon_unavailable`
  - `daemon_health_timeout`
  - `model_provider_error`
  - `rate_limited`
  - `permission_denied`
  - `tool_failed`
  - `validation_failed`
  - `unknown_error`
- [ ] Create `frontend/src/lib/classify-error.ts` with `classifyFrontendError()` function
- [ ] Add unit test for `classifyFrontendError`

### 1.4 Frontend Error Rendering

- [ ] Add inline chat error cards for message/run failures in chat view
- [ ] Ensure toast system is used for global transient failures (verify existing)
- [ ] Verify ErrorBoundary shows fallback UI (already exists, verify integration)
- [ ] Add daemon disconnected banner (top bar when connection health fails)
- [ ] Update `agentStore.ts` / `runStore.ts` to surface API errors to UI

### 1.5 Retry Affordances

- [ ] Add "retry last message" button in chat view
- [ ] Add "retry" button on failed task/run cards
- [ ] Add "reconnect daemon" button on disconnected banner
- [ ] Add "reload MCP servers" button in MCP tools page

### 1.6 Error Handling Tests

- [ ] Test `classifyError` with all error code paths
- [ ] Test route-level error response shape for at least one route
- [ ] Test `classifyFrontendError` with all error categories

### Phase 1 Commit

- [ ] `git commit -m "feat(error-handling): standardize error format, frontend classification, retry affordances"`

---

## Phase 2: AgentProfile Configuration Center

### 2.1 Data Model Expansion

- [ ] Add SQLite migration for new `agent_profiles` columns:
  - `executor_policy` (TEXT, nullable, JSON)
  - `description` (TEXT, nullable)
- [ ] Update `daemon/src/persistence/schema.ts` to include new columns
- [ ] Update `daemon/src/persistence/sqlite/agent-profile-repo.ts`:
  - Add `create()` method
  - Add `update(id, patch)` method
  - Add `delete(id)` method
  - Add `setDefault(id)` method (clear old default, set new)
  - Add `findByIsDefault()` method
- [ ] Ensure backward compatibility: existing profiles load after migration

### 2.2 Validation Schemas

- [ ] Create `daemon/src/shared/validators/agent-profile.ts`:
  - `name` required, non-empty string
  - `model_policy` valid JSON object or null
  - `executor_policy` valid JSON object with known executor value or null
  - `skills` array of strings or null
  - `tools` array of strings or null
  - `knowledge_scopes` array or null
  - `permissions` object or null
  - `memory_scopes` array or null
- [ ] Add validation test

### 2.3 API Endpoints

- [ ] Expand `daemon/src/http/routes/agent-profiles.ts`:
  - [ ] `POST /api/agent-profiles` — create new profile
  - [ ] `PATCH /api/agent-profiles/:id` — update profile
  - [ ] `DELETE /api/agent-profiles/:id` — delete profile (block if last/default)
  - [ ] `POST /api/agent-profiles/:id/set-default` — set as default
- [ ] Add validation middleware for create/update
- [ ] Prevent deleting the last profile or the default without replacement
- [ ] Seed a default agent profile if none exists (on daemon startup or migration)

### 2.4 Agent Profile API Tests

- [ ] Test create with valid payload
- [ ] Test create with missing name (validation error)
- [ ] Test update fields
- [ ] Test delete (success case)
- [ ] Test delete last profile (blocked)
- [ ] Test set-default
- [ ] Test GET /default returns correct profile

### 2.5 Frontend AgentsView Editable

- [ ] Update `frontend/src/stores/agentStore.ts`:
  - Add `createAgent(data)` — POST
  - Add `updateAgent(id, data)` — PATCH
  - Add `deleteAgent(id)` — DELETE
  - Add `setDefaultAgent(id)` — POST /:id/set-default
  - Add dirty state tracking
  - Add validation error state
- [ ] Update `frontend/src/components/shell/views/AgentsView.tsx`:
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

- [ ] `git commit -m "feat(agent-profiles): full CRUD, validation, executor policy, editable frontend"`

---

## Phase 3: Task, Run, Queue, and Runtime Event Closure

### 3.1 Status Model Normalization

- [ ] Define canonical statuses in `packages/runtime-core/src/` or `packages/types/src/`:
  - `draft`, `queued`, `running`, `blocked`, `waiting_for_approval`, `failed`, `completed`, `cancelled`
- [ ] Add status constants and type guard
- [ ] Map existing statuses (if any) to new canonical names with compatibility layer

### 3.2 Queue Service

- [ ] Create `daemon/src/workflow/queue-service.ts`:
  - `enqueue(taskId, agentProfileId, payload)` → returns queue entry
  - `dequeue()` → returns next executable entry
  - `getQueue()` → returns all queued entries
  - `removeFromQueue(id)` → remove entry
  - `getQueueStatus()` → counts by status
  - Persist to `agentRuns` table with status `queued`
- [ ] Add unit tests for queue operations

### 3.3 Slot Manager

- [ ] Create `daemon/src/workflow/slot-manager.ts`:
  - Configurable `maxConcurrentAgentRuns` (default 3)
  - Configurable `maxConcurrentExternalExecutors` (default 1)
  - `canStart()` → boolean
  - `acquireSlot(runId)` → boolean
  - `releaseSlot(runId)` → void
  - `getSlotUsage()` → { active, queued, capacity }
- [ ] Add unit tests

### 3.4 Resource Monitor

- [ ] Create `daemon/src/workflow/resource-monitor.ts`:
  - `getResourceStatus()` → { memoryPercent, freeMemoryMb, diskFreeGb, cpuUsagePercent, externalProcessCount }
  - Use `os.totalmem()`, `os.freemem()`, `os.platform()` for cross-platform
  - For CPU: sample `os.cpus()` times or use a lightweight library
  - For Windows: avoid `os.loadavg()` (not meaningful)
  - Track external executor process count
- [ ] Add unit tests

### 3.5 Run Dispatcher

- [ ] Create `daemon/src/workflow/run-dispatcher.ts`:
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
- [ ] Add integration tests

### 3.6 API Endpoints

- [ ] Expand `daemon/src/http/routes/runs.ts`:
  - [ ] `POST /api/runs/:id/cancel` — cancel a running/queued run
  - [ ] `POST /api/runs/:id/retry` — retry a failed run
- [ ] Expand `daemon/src/http/routes/tasks.ts`:
  - [ ] `POST /api/tasks/:id/start` — enqueue task for execution
  - [ ] `POST /api/tasks/:id/cancel` — cancel task's active run
- [ ] Add new route `daemon/src/http/routes/queue.ts`:
  - [ ] `GET /api/runtime/queue` — list queued items
  - [ ] `GET /api/runtime/resources` — current resource usage

### 3.7 Frontend: RunsView and TasksView Upgrade

- [ ] Update `frontend/src/stores/runStore.ts`:
  - Fetch runs with status filter
  - Cancel run action
  - Retry run action
  - Auto-refresh for running items
- [ ] Update `frontend/src/stores/taskStore.ts`:
  - Start task action
  - Cancel task action
- [ ] Update `frontend/src/components/shell/views/RunsView.tsx`:
  - Show active runs, queued runs, failed runs (tabs or filter)
  - Show current step, elapsed time, runtime id, executor id
  - Show cancel button (for running/queued)
  - Show retry button (for failed)
  - Show approval state
- [ ] Update `frontend/src/components/shell/views/TasksView.tsx`:
  - Show task status with run linkage
  - Start/cancel buttons
- [ ] Update bottom status bar:
  - Active run count
  - Queue count
  - Resource pressure indicator

### 3.8 Queue and Run Tests

- [ ] Queue service: enqueue, dequeue, persistence across restart
- [ ] Slot manager: concurrent limit enforcement
- [ ] Resource monitor: cross-platform resource reading
- [ ] Dispatcher: full lifecycle test with mock runtime

### Phase 3 Commit

- [ ] `git commit -m "feat(queue): durable execution queue, slot manager, resource monitor, run lifecycle"`

---

## Phase 4: Coding Runtime Real Execution

### 4.1 Subprocess Spawning Infrastructure

- [ ] Create `daemon/src/runtimes/coding/process-spawner.ts`:
  - `spawnProcess(command, args, options)` → child process handle
  - Capture stdout/stderr via streams
  - Track PID for cancellation
  - Cross-platform process tree kill (Windows: `taskkill /F /T /PID`, Unix: process group SIGTERM)
  - Timeout support
  - Exit code collection
- [ ] Add unit tests with mock child_process

### 4.2 Codex Adapter Real Implementation

- [ ] Update `daemon/src/runtimes/coding/codex-adapter.ts`:
  - Resolve `codex` command availability (which/codex check)
  - Validate working directory exists and is a git repo
  - Request shell execution permission via PermissionBroker
  - Spawn Codex CLI process with task prompt
  - Stream stdout/stderr as `CodingRunEvent`s
  - Persist logs to file
  - Collect exit code on completion
  - Mark run completed/failed based on exit code
  - Collect artifacts (final summary, changed files, error output)
- [ ] Add integration test with fake command (echo script)

### 4.3 Claude Code Adapter Real Implementation

- [ ] Update `daemon/src/runtimes/coding/claude-code-adapter.ts`:
  - Same pattern as Codex adapter
  - Resolve `claude` command availability
  - Spawn Claude Code CLI process
  - Stream events, persist logs, collect artifacts
- [ ] Add integration test with fake command

### 4.4 Cancellation

- [ ] Implement `cancelRun(runId)` in both adapters:
  - Look up process handle by runId
  - Kill process tree (cross-platform)
  - Mark run as `cancelled`
  - Emit `run_cancelled` event
  - Release slot
- [ ] Add cancellation tests

### 4.5 Artifact Collection

- [ ] Define artifact types: `final_summary`, `changed_files`, `log_path`, `plan_document`, `error_output`
- [ ] Implement artifact persistence:
  - Write to `JARVIS_APP_DATA_DIR/artifacts/{runId}/`
  - Store artifact metadata in `agent_runs` or dedicated table
- [ ] API: `GET /api/runs/:id/artifacts` — list artifacts for a run
- [ ] Frontend: show artifacts in run detail view

### 4.6 Worktree Policy

- [ ] Before spawning coding executor:
  - Require `repoPath` to be set
  - Require `worktreePath` or use default worktree
  - Validate directory is within allowed paths
  - Log permission decision to audit log
- [ ] Integrate with existing `worktree/` module

### 4.7 Permission and Audit Integration

- [ ] All coding executor launches go through `PermissionBroker`
- [ ] Log to `auditLog` table: actor, action, resource, decision, result
- [ ] Mask secrets in logs and events

### 4.8 Coding Runtime Tests

- [ ] Test subprocess spawning with fake command
- [ ] Test cancellation kills process
- [ ] Test artifact collection
- [ ] Test permission denied path
- [ ] Test timeout handling

### Phase 4 Commit

- [ ] `git commit -m "feat(coding-runtime): real subprocess execution, cancellation, artifacts, permission integration"`

---

## Phase 5: Frontend Information Architecture Closure

### 5.1 Left Sidebar Dynamic Data

- [ ] Update sidebar to show real data from stores:
  - Conversation list (from conversationStore)
  - Current workspace/project
  - Agent status indicators
  - Active run count (from runStore)
  - Queued run count (from runStore)
- [ ] Remove any hardcoded TODO/placeholder data

### 5.2 Main Area Views

- [ ] Verify each view loads from stores/API:
  - [ ] Assistant chat view
  - [ ] Tasks view
  - [ ] Runs view
  - [ ] Agents view
  - [ ] Approvals view
  - [ ] Memory view
  - [ ] Projects view
- [ ] Each view must have:
  - Loading state (spinner/skeleton)
  - Empty state (message + action)
  - Error state (message + retry)
- [ ] Remove hardcoded memory content from memory view

### 5.3 Right Inspector Pane

- [ ] Update InspectorPane to show contextual data:
  - Selected conversation details
  - Current agent (from agentStore)
  - Current run (from runStore)
  - Tool call history
  - Related memories
  - Approvals
  - Project context
- [ ] Remove hardcoded placeholder content

### 5.4 Bottom Status Bar

- [ ] Update status bar to show:
  - Daemon connection (green/red dot)
  - Active runtime count
  - Active run count
  - Queue count
  - Model/provider (from agentStore or settingsStore)
  - Resource pressure (from API)
  - Last error indicator

### 5.5 Hardcoded Data Removal Audit

- [ ] Grep for "TODO", "placeholder", "mock", "hardcoded" in frontend components
- [ ] Replace or remove all instances
- [ ] Verify no hardcoded memory content in views

### Phase 5 Commit

- [ ] `git commit -m "feat(frontend): dynamic data everywhere, remove hardcoded placeholders, full IA closure"`

---

## Phase 6: Data Visualization via Data Panel

### 6.1 Chart Tool Definition

- [ ] Add `render_chart` tool to tool registry in `packages/tool-registry/`
- [ ] Define `RenderChartPayload` interface
- [ ] Validate payload: bounded data size, supported chart type, valid keys
- [ ] Reject payloads that try to inject React/HTML

### 6.2 Chart Renderer Components

- [ ] Create `frontend/src/components/data-panel/renderers/ChartRenderer.tsx`
- [ ] Create chart sub-components:
  - [ ] `charts/LineChart.tsx`
  - [ ] `charts/BarChart.tsx`
  - [ ] `charts/PieChart.tsx`
  - [ ] `charts/ScatterChart.tsx`
- [ ] Integrate with Recharts library
- [ ] Register in data panel renderer system

### 6.3 Chart Error Handling

- [ ] Invalid chart payload → safe error UI (not crash)
- [ ] Empty data → empty state message
- [ ] Oversized data → truncation warning

### 6.4 Tests

- [ ] Test chart tool validation
- [ ] Test ChartRenderer with various chart types
- [ ] Verify existing data panel tests still pass

### Phase 6 Commit

- [ ] `git commit -m "feat(data-viz): chart tool and renderers via existing data panel"`

---

## Phase 7: Voice Provider Registry Upgrade

### 7.1 Provider Registry

- [ ] Define `VoiceProviderDefinition` interface
- [ ] Create `daemon/src/runtimes/voice/provider-registry.ts`:
  - `listProviders()` → available providers
  - `getProvider(id)` → provider details
  - `registerProvider(def)` → add custom provider
- [ ] Separate provider metadata from execution logic

### 7.2 Voice Settings API

- [ ] Add endpoints:
  - `GET /api/voice/providers` — list available ASR/TTS providers
  - `GET /api/voice/config` — current voice configuration
  - `PUT /api/voice/config` — save voice configuration
  - `POST /api/voice/test-tts` — test TTS with sample text
  - `POST /api/voice/test-asr` — test ASR with sample audio

### 7.3 Voice Settings UI

- [ ] Update `frontend/src/components/control-center/VoicePage.tsx`:
  - ASR provider select
  - ASR model select
  - TTS provider select
  - TTS model select
  - Voice select
  - Speed slider
  - Test TTS button
  - Save button

### 7.4 Secret Management

- [ ] Store API keys in SecretStore (Rust) or clearly marked temporary path
- [ ] Document migration path for when SecretStore is ready

### 7.5 Tests

- [ ] Test provider registry operations
- [ ] Test voice config save/load
- [ ] Test TTS test endpoint

### Phase 7 Commit

- [ ] `git commit -m "feat(voice): provider registry, configurable ASR/TTS, settings UI"`

---

## Phase 8: A2A and External Agent Federation (Skeleton)

### 8.1 Protocol Definition

- [ ] Create `daemon/src/runtimes/external-agent/protocol.ts`:
  - Define A2A message types
  - Define capability discovery interface
  - Define task delegation interface

### 8.2 Adapter Skeleton

- [ ] Create `daemon/src/runtimes/external-agent/a2a-adapter.ts` (skeleton)
- [ ] Create `daemon/src/runtimes/external-agent/local-cli-adapter.ts` (skeleton)
- [ ] Register in runtime host

### 8.3 Acceptance (Future)

- [ ] External agent can be discovered
- [ ] Capabilities can be listed
- [ ] Task can be delegated
- [ ] Result can be returned
- [ ] Permission decisions remain local
- [ ] Audit log records delegation

### Phase 8 Commit

- [ ] `git commit -m "feat(a2a): external agent federation protocol skeleton"`

---

## Final Verification

### Type Checking and Linting

- [ ] `pnpm typecheck` — passes
- [ ] `pnpm lint` — passes
- [ ] `pnpm test` — all existing tests pass
- [ ] `cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check` — passes
- [ ] `cargo clippy --manifest-path frontend/src-tauri/Cargo.toml -- -D warnings` — passes

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

- [ ] Packaged app starts daemon reliably
- [ ] Daemon failures are visible and diagnosable
- [ ] Agent profiles are editable and persisted
- [ ] A task can be queued and converted into an agent run
- [ ] Queue and slot limits prevent unbounded execution
- [ ] A coding runtime can execute at least one real or fake external command
- [ ] Run events are visible in the frontend
- [ ] User can cancel/retry failed work
- [ ] Permission and audit logs are created for risky execution
- [ ] No hardcoded placeholder panels remain in the main workflow path

### Documentation Updates

- [ ] Update `docs/architecture/final-multi-runtime-architecture.md`
- [ ] Update `docs/architecture/final-directory-structure-design.md`
- [ ] Update this execution plan with completion status
