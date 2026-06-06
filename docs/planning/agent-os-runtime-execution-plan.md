# Agent OS Runtime Execution Plan

> Based on `docs/architecture/agent-os-next-execution-todo.md`
> Each phase creates a feature branch, builds/tests, then merges to main.
> Tick `[x]` as each item is completed.

---

## Current State Assessment

**Already completed (on main):**
- [x] Phase 1-6: Data foundation, memory, unified runTurn, permissions, project UI, task graph
- [x] Runtime hardening commit `7bc2450`: runTurn for non-streaming, approval blocking, TaskGraph semantics
- [x] Phase 17.1-17.4: RAG tool selection, tiered prompts, memory snapshots, tool categorization
- [x] Phase 18.1-18.4: Voice interrupt, voice prompt, ASR hallucination filter, audio buffer

**Key gaps to fill:**
- [x] Streaming chat bypasses AgentRun runtime
- [x] Voice streaming bypasses AgentRun runtime
- [x] No `run-stream-executor.ts`
- [x] No `task-status.ts` (status normalization)
- [x] Approval system lacks idempotency/expiration/restart
- [ ] Phase 19 not implemented
- [ ] Phase 20 not implemented

---

## Phase 1: Streaming Runtime Unification

**Branch:** `feat/runtime-stream-turn` — **Status:** `DONE`

- [x] **1.1** Create `daemon/src/runtime/run-stream-executor.ts`
  - [x] Define `AgentStreamRunResult` type (`runId`, `conversationId`, `stream: AsyncIterable<AgentRunEvent>`, `abortController`)
  - [x] Implement `runStreamTurn(request, options?)` function
  - [x] Create AgentRun record before first token is streamed
  - [x] Emit `run_started` event
  - [x] Save or reuse conversation
  - [x] Save user message once
  - [x] Delegate to `streamChat()` with tool event callback
  - [x] Wrap fullStream: yield `delta` events as `AgentRunEvent`
  - [x] Surface `thinking` events
  - [x] Surface `tool_call` / `tool_result` events
  - [x] Capture approval events via tool-runtime
  - [x] Save assistant message at stream end
  - [x] Mark AgentRun `succeeded` only after assistant message saved
  - [x] Mark AgentRun `failed` on stream error
  - [x] Abort upstream on client disconnect, mark run `cancelled`
  - [x] Run watchdog: 180s timeout per turn

- [x] **1.2** Update type declarations
  - [x] Add `AgentStreamRunResult` to `daemon/src/runtime/agent-run.ts`
  - [x] Export `runStreamTurn` from `daemon/src/runtime/index.ts`

- [x] **1.3** Rewrite `daemon/src/api/chat.ts` `/stream` endpoint
  - [x] Replace direct `streamChat()` call with `runStreamTurn()`
  - [x] Keep same SSE event names for frontend compatibility (`delta`, `thinking`, `tool_calls`, `tool_result`, `error`, `done`)
  - [x] Propagate client disconnect via `abortController`
  - [x] Remove duplicated conversation setup logic

- [x] **1.3b** Add AgentRun tracking to `daemon/src/api/conversations.ts` `/messages/stream` endpoint
  - [x] Create AgentRun before streaming
  - [x] Mark AgentRun succeeded/failed/cancelled on completion/error/disconnect
  - [x] Keep existing `streamMessageInConversation` flow intact (force answer, goal continuation)

- [x] **1.4** Add tests
  - [x] Test: streaming creates AgentRun row
  - [x] Test: stream emits delta events
  - [x] Test: stream captures tool calls
  - [x] Test: model error marks run as failed
  - [x] Test: client disconnect marks run as cancelled
  - [x] Test: watchdog timeout aborts long-running turn

- [x] **1.5** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (846 tests)
  - [x] `pnpm --filter frontend typecheck` passes

---

## Phase 2: Voice Runtime Unification

**Branch:** `feat/runtime-voice-unification` — **Status:** `DONE`

- [x] **2.1** Rewrite `daemon/src/api/voice.ts` `/converse-stream` endpoint
  - [x] Replace direct `streamChat()` call with `runStreamTurn({ mode: "voice" })`
  - [x] Keep same SSE event names for frontend compatibility
  - [x] Voice runs create AgentRun rows with `mode = "voice"`
  - [x] Voice tool calls use approval gate
  - [x] Voice errors mark AgentRun failed
  - [x] Remove duplicated conversation setup logic

- [x] **2.2** Rewrite `daemon/src/api/voice.ts` `/converse-voice-stream` endpoint
  - [x] Use `runStreamTurn({ mode: "voice" })` for LLM streaming
  - [x] TTS consumes runtime deltas, not own model loop
  - [x] Keep same SSE event names (`delta`, `tts_audio`, `done`, `error`)

- [x] **2.3** Voice-specific permission defaults
  - [x] Default conservative permission policy for voice mode
  - [x] `voice + write/delete/execute tool -> confirmation required`
  - [x] `voice + external API side effect -> confirmation required`
  - [x] `voice + local read-only query -> allow/notify`

- [x] **2.4** Add tests
  - [x] Test: voice SSE still works from frontend
  - [x] Test: voice run produces AgentRun row
  - [x] Test: voice tool calls use approval gate
  - [x] Test: voice errors mark AgentRun failed
  - [x] Test: wake-word -> response -> listening loop works (server-side: converse-stream + converse-voice-stream route tests)

- [x] **2.5** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes
  - [x] `pnpm --filter frontend typecheck` passes

---

## Phase 3: Approval System Hardening

**Branch:** `feat/approval-safety-hardening` — **Status:** `DONE`

- [x] **3.1** Risk classification improvements
  - [x] Add `risk = "critical"` support consistently in daemon approval types
  - [x] Add tool category/action: `read`, `write`, `delete`, `execute`, `external_side_effect`
  - [x] Add mode and source context: `chat`, `voice`, `scheduled`, `workflow`

- [x] **3.2** Preview payload
  - [x] Add user-facing preview: what will change, where, why
  - [x] Validate tool args before approval display (schema validation, path/URL normalization)

- [x] **3.3** Expiration behavior
  - [x] Pending confirmations auto-resolve as denial after timeout
  - [x] Process restart: stale pending approvals become expired, not executable
  - [x] Expired approvals do not execute the tool

- [x] **3.4** Idempotency
  - [x] Re-approving an already approved request does not execute tool twice
  - [x] Use `toolCallId`-based dedup

- [x] **3.5** Audit logs
  - [x] Log approved decisions
  - [x] Log denied decisions
  - [x] Log expired decisions
  - [x] Log auto-allowed decisions

- [x] **3.6** Add tests
  - [x] Test: high/critical tool cannot execute without approval
  - [x] Test: denial does not execute the tool
  - [x] Test: expiration does not execute the tool
  - [x] Test: re-approving does not execute twice
  - [x] Test: approval request includes context for UI and audit
  - [x] Test: restart stale state handling

- [x] **3.7** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes
  - [x] `pnpm --filter @jarvis/permission-guard test -- --run` passes

---

## Phase 4: Task Status Normalization

**Branch:** `feat/task-status-normalization` — **Status:** `DONE`

- [x] **4.1** Create status helper module (backend)
  - [x] Create `daemon/src/task/task-status.ts`
  - [x] Implement `normalizeTaskStatus(status)` — legacy alias mapping
  - [x] Implement `isTaskComplete(status)`
  - [x] Implement `isTaskExecutable(status)`
  - [x] Implement `isTaskTerminal(status)`
  - [x] Implement `toLegacyTaskStatus(status)`

- [x] **4.2** Create status helper module (frontend)
  - [x] Create `frontend/src/lib/taskStatus.ts`
  - [x] Mirror backend helpers for UI use

- [x] **4.3** Canonical statuses enforced
  - [x] Backend canonical: `draft | queued | running | blocked | needs_review | completed | failed | cancelled | deleted`
  - [x] Legacy aliases only at API/UI edges: `pending -> queued`, `in_progress -> running`, `done -> completed`

- [x] **4.4** Update consumers
  - [x] Update `daemon/src/task/task-graph.ts` to use helpers
  - [x] Update `daemon/src/sensors/todo-sensor.ts` to use helpers
  - [x] Update `daemon/src/reports/generator.ts` to use helpers
  - [x] Update `daemon/src/orchestrator/conversation.ts` to use helpers
  - [x] Update `daemon/src/db/sqlite/review-repo.ts` to use helpers
  - [x] Update `daemon/src/db/supabase/review-repo.ts` to use helpers

- [x] **4.5** Add tests
  - [x] Test: legacy alias normalization
  - [x] Test: `isTaskComplete` for all statuses
  - [x] Test: `isTaskExecutable` for all statuses
  - [x] Test: `isTaskTerminal` for all statuses
  - [x] Test: `toLegacyTaskStatus` for all statuses
  - [x] Test: `TASK_STATUSES` constant

- [x] **4.6** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (865 tests)
  - [x] `pnpm --filter frontend typecheck` passes

---

## Phase 5: Context Propagation

**Branch:** `feat/runtime-context-resolver` — **Status:** `DONE`

- [x] **5.1** Create runtime context resolver
  - [x] Create `daemon/src/runtime/run-context.ts`
  - [x] Implement `resolveRunContext(input)` — resolves workspace, project, agent, conversation
  - [x] Auto-create default workspace if missing
  - [x] Auto-create default agent if missing

- [x] **5.2** Move default creation out of API routes
  - [x] Remove `getDefaultRunContext()` from `daemon/src/api/chat.ts`
  - [x] Remove `getDefaultRunContext()` from `daemon/src/api/voice.ts`
  - [x] Use resolver from chat, voice, scheduler, task execution

- [x] **5.3** Scope propagation
  - [x] AgentRun and conversation scopes match
  - [x] When creating conversations, persist `workspaceId`/`projectId` if available
  - [x] Memory retrieval includes proper scope

- [x] **5.4** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (865 tests)
  - [x] `pnpm --filter frontend typecheck` passes

---

## Phase 6: Autonomous Running & Fault Tolerance

**Branch:** `feat/autonomous-running` — **Status:** `DONE`

- [x] **6.1** Idle tick processing
  - [x] Add idle callback handler in `daemon/src/scheduler.ts`
  - [x] TICK executes: memory compaction, todo expiry check, reading list update, conversation summary
  - [x] NO_REPLY mode: agent output prefixed with `NO_REPLY` is silent to frontend
  - [x] Rate limit: max once per 30 minutes

- [x] **6.2** Force answer mechanism
  - [x] Detect in orchestrator loop: 3 consecutive tool-only rounds with no text
  - [x] Detect: tool call results empty/error
  - [x] Trigger: disable all tools, inject "answer directly" prompt
  - [x] Perform non-streaming LLM call
  - [x] Return synthesized answer

- [x] **6.3** Run watchdog
  - [x] 180s timeout per agent turn
  - [x] Abort current LLM call on timeout
  - [x] Preserve partial results
  - [x] Log timeout for diagnostics
  - [x] Reuse existing stream timeout configuration

- [x] **6.4** Tests
  - [x] Test: idle tick triggers on scheduler idle period
  - [x] Test: NO_REPLY mode silences frontend
  - [x] Test: force answer activates on tool loop
  - [x] Test: normal flow does not trigger force answer

- [x] **6.5** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (865 tests)

---

## Phase 7: Event Persistence

**Branch:** `feat/agent-run-event-store` — **Status:** `DONE`

- [x] **7.1** Database schema
  - [x] Add `agent_run_events` table to `daemon/src/db/schema.ts`
  - [x] Fields: `id`, `run_id`, `sequence`, `type`, `payload`, `created_at`

- [x] **7.2** Repository interface
  - [x] Add `AgentRunEventRepository` to `daemon/src/db/repository.ts`
  - [x] Methods: `create(event)`, `getByRunId(runId)`, `getByType(runId, type)`

- [x] **7.3** SQLite implementation
  - [x] Create `daemon/src/db/sqlite/agent-run-event-repo.ts`

- [x] **7.4** Wire into runtime
  - [x] Persist events in `run-executor.ts` during run
  - [x] Persist events in `run-stream-executor.ts` during stream
  - [x] Large text deltas persisted compactly or summarized

- [x] **7.5** Add tests
  - [x] Test: every event has runId and sequence
  - [x] Test: events are persisted in order
  - [x] Test: event ordering for run with tool call and approval

- [x] **7.6** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (865 tests)

---

## Phase 8: Config Validation & Memory Tracking

**Branch:** `feat/config-validation-memory-tracking` — **Status:** `DONE`

- [x] **8.1** Config schema validation (Zod)
  - [x] Introduce Zod dependency
  - [x] Define config schema with Zod in `daemon/src/config/config-schema.ts`
  - [x] Validate at startup
  - [x] Auto-fill defaults for missing fields
  - [x] Warn on invalid fields, ignore them

- [x] **8.2** Memory usage tracking
  - [x] Add `injectCount` and `lastInjectedAt` to memory records in schema (field named `uses`)
  - [x] Update inject count on each memory injection (`recordInjection`)
  - [x] Archive memories unused for 90+ days (`pruneUnusedMemories`)
  - [x] Promote frequently used memories to pinned level (`promoteHighUsage`)

- [x] **8.3** Add tests
  - [x] Test: valid config passes validation
  - [x] Test: missing fields filled with defaults
  - [x] Test: invalid fields warn and are ignored
  - [x] Test: inject count updates correctly
  - [x] Test: long-unused memories are archived
  - [x] Test: frequently used memories are promoted

- [x] **8.4** Verify build
  - [x] `pnpm --filter daemon typecheck` passes
  - [x] `pnpm --filter daemon test -- --run` passes (865 tests)

---

## Execution Sequence

```
Phase 1 (stream-turn)  ──> merge to main
Phase 2 (voice-unify)  ──> merge to main  (depends on Phase 1)
Phase 3 (approval)     ──> merge to main  (independent)
Phase 4 (status-norm)  ──> merge to main  (independent)
Phase 5 (context)      ──> merge to main  (independent)
Phase 6 (autonomous)   ──> merge to main  (independent)
Phase 7 (events)       ──> merge to main  (depends on Phase 1)
Phase 8 (config/mem)   ──> merge to main  (independent)
```

## Verification After Each Phase

```bash
pnpm --filter @jarvis/permission-guard test -- --run
pnpm --filter daemon test -- --run
pnpm --filter daemon typecheck
pnpm --filter frontend typecheck
pnpm --filter frontend test -- --run
```

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Streaming runtime | New `runStreamTurn` alongside `runTurn` | Non-breaking; streaming is async iterable |
| Voice through same runtime | Yes, mode="voice" | Single audit spine per architecture |
| Approval idempotency | toolCallId-based dedup | Same toolCall should not execute twice |
| Task status | Canonical + legacy aliases | Backward compatible, migration path clear |
| Config validation | Zod | Already common in TS ecosystem |
| Memory tracking | injectCount + lastInjectedAt | Simple, sufficient for archive/promote |
