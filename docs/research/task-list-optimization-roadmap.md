# Optimization Roadmap — Task List

**Branch**: per-phase feature branches from `main`
**Created**: 2026-06-03
**Reference**: [Competitive Analysis](./2026-06-03-competitive-analysis-and-optimization-roadmap.md)
**Prior Work**: [Agent Patterns Phases 1-10](./task-list-agent-patterns.md) — all complete

### Workflow

Each phase follows this flow:
1. Create `feat/optimization-phase-N` from `main`
2. Implement, test, typecheck
3. Merge to `main` (fast-forward or merge commit)
4. Next phase branches from updated `main`

---

## Status Legend

- [x] Done
- [~] In Progress
- [ ] Todo
- [!] Blocked

---

## Phase 11: Reliability Foundations

> Source: Hermes (retry logic) + Odysseus (stream control)
> Goal: Provider resilience, stream safety, config performance
> Effort: 2-3 days

### 11.1 Provider Retry with Exponential Backoff

> Files: `daemon/src/ai/provider.ts`

- [x] Add retry logic inside `callWithFallback` wrapper
- [x] Retry on 429 (rate limit) and 503 (service unavailable) — max 3 attempts
- [x] Exponential backoff delays: 1s, 2s, 4s
- [x] Non-retryable errors (auth, 4xx non-429) throw immediately
- [x] Log retry attempts with attempt number and delay
- [x] Tests: retry on 429, retry on 503, skip retry on auth, max attempts reached

### 11.2 DeadHost Exponential Backoff

> Files: `daemon/src/ai/dead-host.ts`

- [x] Change fixed 20s cooldown to exponential: 20s → 40s → 80s → 160s (cap)
- [x] Track consecutive failure count per provider
- [x] Reset backoff on successful call
- [x] Tests: backoff progression, cap at 160s, reset on success

### 11.3 ConfigManager In-Memory Cache

> Files: `daemon/src/config/config-manager.ts`

- [x] Add in-memory config cache (mtime-based)
- [x] Invalidate cache on file modification (mtime check)
- [x] `getConfig()` returns cached value, reads disk only on miss or invalidation
- [x] `getCredentials()` same pattern
- [x] Export `invalidateConfigCache()` for manual invalidation
- [x] Tests: cache hit returns same object, file change invalidates

### 11.4 Stream Abort via AbortController

> Files: `daemon/src/orchestrator/conversation.ts`, `daemon/src/api/chat.ts`

- [x] Create AbortController in `streamMessageInConversation`
- [x] Pass `abortSignal` to `streamText({ abortSignal })`
- [x] Use `configManager.getStreamTimeout()` (120s default) as timeout
- [x] `setTimeout` → `controller.abort()` on timeout
- [x] Clear timeout on normal stream completion
- [x] Log timeout events for monitoring

### 11.5 Client SSE Disconnect Propagation

> Files: `daemon/src/api/chat.ts`, `daemon/src/api/conversations.ts`

- [x] Detect client disconnect via Hono's `c.req.raw.signal`
- [x] On disconnect, call `abortController.abort()` to stop upstream stream
- [x] Clean up resources (clearTimeout in onFinish)
- [x] Log: `[Stream] client disconnected, aborting upstream`

### 11.6 Integration & Testing

- [x] All new tests pass (`pnpm -r test`) — 472 passed
- [x] Type check clean (`pnpm -r typecheck`)
- [x] Commit: `feat(ai): provider retry, exponential backoff, stream abort, config cache`

---

## Phase 12: Model Routing & Token Intelligence

> Source: Hermes (provider resolver) + Odysseus (agent metrics)
> Goal: Smart model selection, token visibility, cost awareness
> Effort: 3-4 days

### 12.1 Wire ModelGateway into Orchestrator

> Files: `daemon/src/orchestrator/conversation.ts`, `packages/model-gateway/src/gateway.ts`

- [x] Import ModelGateway in conversation orchestrator
- [x] Replace `configManager.getActiveModel()` with `gateway.selectModel(criteria)`
- [x] Criteria to extract from context:
  - `mode`: 'chat' | 'code' | 'reasoning' (from tool usage or explicit flag)
  - `answerLength`: 'short' | 'medium' | 'long' (from message length heuristic)
  - `toolCalling`: boolean (tools available in context)
  - `privacy`: boolean (local-only preference)
  - `vision`: boolean (image in message)
- [x] Fallback to active model if gateway returns no match
- [x] Log selected model and routing reason
- [x] Tests: routing by mode, routing by tool calling, fallback behavior

### 12.2 Memory Relevance Threshold

> Files: `daemon/src/orchestrator/context-builder.ts`, `daemon/src/orchestrator/conversation.ts`

- [x] Add `MEMORY_MIN_SCORE` constant (0.3)
- [x] Filter `fetchRelevantMemories` results below threshold
- [x] Log filtered-out count for monitoring
- [x] Make threshold configurable via config
- [x] Tests: memories below threshold excluded, above threshold included, edge cases

### 12.3 Token Usage Tracking

> Files: `daemon/src/orchestrator/conversation.ts`, `daemon/src/db/conversation-repo.ts`

- [x] Add `promptTokens` and `completionTokens` columns to conversations table
- [x] Accumulate usage in `onStepFinish` callback (AI SDK provides `usage` object)
- [x] Write accumulated totals to DB on stream finish
- [x] Add `totalTokens` computed field
- [x] Migration for new columns
- [x] Tests: accumulation across steps, DB persistence, migration

### 12.4 Frontend Token Display

> Files: `frontend/src/stores/conversationStore.ts`, `frontend/src/components/`

- [x] Add `tokenUsage` field to conversation store
- [x] Display token count per conversation in sidebar (subtle, non-intrusive)
- [x] Show total tokens in conversation header or footer
- [x] Tests: store update on conversation load

### 12.5 Cost Estimation

> Files: `packages/model-gateway/src/catalog.ts`, `daemon/src/api/settings.ts`

- [x] Add cost-per-token pricing to model catalog (input/output)
- [x] Compute estimated cost from token usage
- [x] Expose via settings API: `GET /api/settings/usage`
- [x] Frontend: show estimated cost in settings page
- [x] Tests: cost computation per model, zero cost for free models

### 12.6 Integration & Testing

- [x] All new tests pass
- [x] Type check clean
- [x] Manual test: verify model routing selects different models for different tasks
- [x] Commit: `feat(orchestrator): model gateway routing, token tracking, cost estimation`

---

## Phase 13: Layered Memory System

> Source: BaiLongma (L1/L2 + Focus Stack) + Hermes (memory tiers)
> Goal: Smarter memory, preserve tool knowledge, deeper context
> Effort: 4-5 days

### 13.1 Tool Result Summary Preservation

> Files: `daemon/src/orchestrator/compressor.ts`

- [x] Before compression, extract structured summaries from tool results
- [x] New function: `extractToolSummaries(messages)` — returns tool name + key output (max 200 chars each)
- [x] Include tool summaries in the compression prompt as "preserved context"
- [x] Update `SUMMARY_SYSTEM_PROMPT` to accept and incorporate tool summaries
- [x] Tests: tool summaries extracted, included in compressed output, raw output discarded

### 13.2 Memory Tier Separation

> Files: `daemon/src/orchestrator/context-builder.ts`, `daemon/src/db/sqlite/memory-repo.ts`

- [x] Add `tier` field to memory schema: `'preference' | 'context' | 'fact'`
- [x] Auto-classify on insert based on content patterns:
  - preference: "用户喜欢/偏好/习惯..."
  - context: general topical memories
  - fact: explicit factual statements
- [x] In ContextBuilder, inject tiers differently:
  - preference: always inject (no score threshold, max 5)
  - context: score-thresholded (max 8)
  - fact: score-thresholded (max 5)
- [x] Migration for tier column
- [x] Tests: auto-classification, tier-specific injection, migration

### 13.3 Conversation Summary as ContextSection

> Files: `daemon/src/orchestrator/context-builder.ts`

- [x] Move `[对话摘要]` extraction from system message parsing to dedicated ContextSection
- [x] New section: `conversation-summary` with its own token budget (1500 tokens)
- [x] Place after tool catalog, before memories
- [x] Tests: summary appears as separate section, budget respected

### 13.4 Tool Call Chain Compression

> Files: `daemon/src/orchestrator/compressor.ts`

- [x] When compressing tool call/result pairs, produce structured output:
  ```
  [工具调用摘要]
  - search_tasks: 找到3个待办任务
  - create_task: 创建了"完成报告"任务
  ```
- [x] Update compression prompt to include tool chain format
- [x] Tests: tool chains summarized with key outcomes, not raw output

### 13.5 Long-Term Preference Extraction

> Files: `daemon/src/orchestrator/compressor.ts`, `daemon/src/db/sqlite/memory-repo.ts`

- [x] After compression, run a second LLM pass to extract user preferences
- [x] Prompt: "从以下对话摘要中提取用户偏好、习惯、工作方式，以JSON格式输出"
- [x] Store extracted preferences as `tier: 'preference'` memories
- [x] Deduplicate against existing preferences (case-insensitive match)
- [x] Tests: preferences extracted, deduplicated, stored correctly

### 13.6 Integration & Testing

- [x] All new tests pass
- [x] Type check clean
- [x] Manual test: long conversation compresses cleanly, tool knowledge preserved
- [x] Commit: `feat(memory): layered memory system, tool summary preservation, preference extraction`

---

## Phase 14: Autonomous Operation

> Source: BaiLongma (Consciousness Loop) + Hermes (Cron)
> Goal: Background processing, proactive assistance
> Effort: 3-4 days

### 14.1 Cron Task System

> Files: `daemon/src/scheduler.ts`

- [x] Extend scheduler with cron expression support (use `croner` or `cron-parser` package)
- [x] Task data model: `{ id, name, cronExpr, prompt, skillId?, enabled, lastRun, nextRun }`
- [x] CRUD API: `GET/POST/PUT/DELETE /api/tasks/scheduled`
- [x] Task execution: run prompt through orchestrator, deliver result via notification
- [x] Natural language time parsing: "每天早上9点" → `0 9 * * *`
- [x] Tests: cron scheduling, execution, CRUD, natural language parsing

### 14.2 Idle Memory Consolidation

> Files: `daemon/src/orchestrator/compressor.ts`, `daemon/src/scheduler.ts`

- [x] Detect idle state: no active conversation for configurable N minutes (default 10)
- [x] On idle trigger:
  - Find recent uncompressed conversations
  - Run compression on each
  - Extract preferences (Phase 13.5)
  - Prune memories with 0 uses and age > 30 days
- [x] Log consolidation results (conversations processed, memories created, memories pruned)
- [x] Tests: idle detection, consolidation runs, pruning logic

### 14.3 Resource Sensing

> Files: new `daemon/src/sensors/` directory

- [x] Create sensor registry pattern (check for changes in configured data sources)
- [x] Sensors: todo list changes, reading list changes, config file changes
- [x] On change detected: update relevant context/memories
- [x] Debounce: don't trigger on rapid successive changes
- [x] Tests: change detection, debounce, memory update

### 14.4 Scheduled Report Generation

> Files: `daemon/src/scheduler.ts`, `daemon/src/tools/`

- [x] Report templates: daily summary, weekly overview
- [x] Data sources: task completion, reading progress, conversation highlights
- [x] Output: formatted markdown, delivered via notification or stored as memory
- [x] Configurable schedule (default: daily at 21:00)
- [x] Tests: report generation, template rendering, scheduling

### 14.5 Integration & Testing

- [x] All new tests pass
- [x] Type check clean
- [x] Manual test: cron task fires, idle consolidation runs, report generates
- [x] Commit: `feat(autonomous): cron tasks, idle consolidation, resource sensing`

---

## Phase 15: Conversation Intelligence

> Source: ChatGPT/Claude/Gemini UIs
> Goal: Branching, editing, search, export
> Effort: 4-5 days

### 15.1 Message Editing

> Files: `daemon/src/db/conversation-repo.ts`, `daemon/src/orchestrator/conversation.ts`, frontend

- [x] Add `PUT /api/conversations/:id/messages/:msgId` endpoint
- [x] On edit: update message content
- [x] Frontend: inline edit UI on user messages (deferred to frontend phase)
- [x] Tests: edit message content

### 15.2 Response Regeneration

> Files: `daemon/src/api/conversations.ts`, frontend

- [x] Add `POST /api/conversations/:id/messages/:msgId/regenerate` endpoint
- [x] Delete last assistant message, re-run orchestrator with same user message
- [x] Frontend: "regenerate" button on assistant messages (deferred to frontend phase)
- [x] Tests: regeneration produces new response, old response replaced

### 15.3 Conversation Branching

> Files: `daemon/src/db/schema.ts`, `daemon/src/db/conversation-repo.ts`

- [x] Add `parentMessageId` column to messages table (nullable)
- [x] `getMessageBranches(messageId)` — returns all alternative responses
- [x] `getConversationTree(conversationId)` — returns full tree structure
- [x] Migration for parentMessageId
- [x] Tests: branch creation, tree traversal, branch switching

### 15.4 Branch Switching UI

> Files: frontend components

- [ ] Display branch indicator on messages with multiple alternatives
- [ ] Left/right arrows to navigate between branches
- [ ] Branch count badge (e.g., "2/3")
- [ ] Active branch highlighting
- [ ] Tests: branch navigation renders correctly

### 15.5 Cross-Conversation Search

> Files: `daemon/src/db/schema.ts`, `daemon/src/db/conversation-repo.ts`, frontend

- [x] Add FTS5 virtual table on messages content
- [x] `searchMessages(query, limit)` — returns matching messages with conversation context
- [x] API: `GET /api/messages/search?q=...`
- [ ] Frontend: search input in sidebar, results dropdown with conversation preview
- [x] Tests: FTS5 indexing, search results, relevance ordering

### 15.6 Conversation Export

> Files: `daemon/src/api/conversations.ts`, frontend

- [x] `GET /api/conversations/:id/export?format=markdown`
- [x] `GET /api/conversations/:id/export?format=json`
- [x] Markdown format: role headers, formatted content, tool results collapsed
- [x] JSON format: full message array with metadata
- [ ] Frontend: export button in conversation menu
- [x] Tests: markdown export format, JSON export format, empty conversation

### 15.7 Integration & Testing

- [x] All new tests pass
- [x] Type check clean
- [x] Manual test: edit message → branch created → search finds content → export works
- [x] Commit: `feat(conversation): branching, editing, regeneration, search, export`

---

## Phase 16: Voice Pipeline Refactor

> Source: BaiLongma (voice architecture) + Hermes (voice mode)
> Goal: Decompose god-component, improve robustness
> Effort: 5-6 days

### 16.1 Extract useASR Hook

> Files: new `frontend/src/hooks/useASR.ts`

- [ ] Extract ASR logic from `useVoiceConversation`
- [ ] Interface: `{ start(), stop(), transcript, isListening, error }`
- [ ] Web Speech API primary, Whisper fallback (existing logic)
- [ ] Auto-restart on silence timeout (existing behavior)
- [ ] Cleanup on unmount
- [ ] Tests: start/stop, transcript updates, fallback behavior

### 16.2 Extract useTTSPlayback Hook

> Files: new `frontend/src/hooks/useTTSPlayback.ts`

- [ ] Extract TTS playback from `useVoiceConversation`
- [ ] Interface: `{ play(sentences), stop(), setVolume(v), isPlaying, currentSentence }`
- [ ] AudioQueueManager lifecycle management
- [ ] AudioContext reuse (don't create new one per conversation)
- [ ] Cleanup on unmount
- [ ] Tests: playback sequence, volume control, stop clears queue

### 16.3 Extract useBargeIn Hook

> Files: new `frontend/src/hooks/useBargeIn.ts`

- [ ] Extract barge-in monitoring from `useVoiceConversation`
- [ ] Interface: `{ start(micStream, onBargeIn), stop(), isMonitoring }`
- [ ] Volume monitoring via AnalyserNode
- [ ] BargeInStateMachine integration
- [ ] CircularPCMBuffer for pre-buffering
- [ ] Tests: barge-in triggers, false-positive recovery

### 16.4 Create useVoiceFSM

> Files: new `frontend/src/hooks/useVoiceFSM.ts`

- [ ] Top-level state machine: `idle → listening → processing → speaking → post-listen`
- [ ] Composes useASR, useTTSPlayback, useBargeIn
- [ ] State transitions with guards (e.g., can only go to `speaking` from `processing`)
- [ ] Event-driven: `WAKE`, `ASR_RESULT`, `LLM_TOKEN`, `TTS_DONE`, `BARGE_IN`, `SILENCE`, `ERROR`
- [ ] Replace 14+ refs with structured state
- [ ] Tests: all state transitions, guard conditions, error recovery

### 16.5 Voice Error Recovery

> Files: `frontend/src/hooks/useVoiceFSM.ts`, `frontend/src/hooks/useChat.ts`

- [ ] On LLM stream failure mid-voice-conversation: retry once before giving up
- [ ] On TTS failure: skip sentence, continue with next
- [ ] On ASR failure: fallback to Whisper (already exists, ensure it works)
- [ ] User-visible error state with manual retry option
- [ ] Tests: each failure mode, retry behavior, user feedback

### 16.6 Connection Health Monitoring

> Files: `frontend/src/lib/jarvisClient.ts`

- [ ] Add heartbeat check: `GET /api/health` every 30s during active voice
- [ ] On heartbeat failure: show connection lost indicator
- [ ] On heartbeat recovery: reconnect and resume
- [ ] Tests: heartbeat failure detection, recovery

### 16.7 TTS Batching

> Files: `frontend/src/hooks/useTTSPlayback.ts`, `daemon/src/api/voice.ts`

- [ ] Batch multiple sentences into single `/api/voice/synthesize-batch` request
- [ ] Server-side: process batch, return ordered audio chunks
- [ ] Client-side: queue received chunks for sequential playback
- [ ] Fallback to per-sentence if batch endpoint unavailable
- [ ] Tests: batch synthesis, ordering preserved, fallback behavior

### 16.8 Thinking Event Display

> Files: frontend chat components

- [ ] Add `thinking` event handler to SSE parser (currently silently dropped)
- [ ] Display thinking content in a collapsible section during streaming
- [ ] Style: dimmed text, expandable, auto-collapse after response complete
- [ ] Tests: thinking events rendered, collapse behavior

### 16.9 Integration & Testing

- [ ] All new tests pass
- [ ] Type check clean
- [ ] Manual test: full voice flow with new hooks, barge-in works, error recovery works
- [ ] Commit: `refactor(voice): decompose voice pipeline, add error recovery, TTS batching`

---

## Quick Reference: File Map

| Phase | File | Action | Description |
|-------|------|--------|-------------|
| 11 | `daemon/src/ai/provider.ts` | Modify | Retry with exponential backoff |
| 11 | `daemon/src/ai/dead-host.ts` | Modify | Exponential backoff cooldown |
| 11 | `daemon/src/config/config-manager.ts` | Modify | In-memory cache + fs.watch |
| 11 | `daemon/src/orchestrator/conversation.ts` | Modify | AbortController for stream |
| 11 | `daemon/src/api/chat.ts` | Modify | Client disconnect propagation |
| 12 | `daemon/src/orchestrator/conversation.ts` | Modify | Wire ModelGateway |
| 12 | `packages/model-gateway/src/gateway.ts` | Verify | Ensure routing logic complete |
| 12 | `daemon/src/orchestrator/context-builder.ts` | Modify | Memory min score threshold |
| 12 | `daemon/src/db/conversation-repo.ts` | Modify | Token usage columns |
| 12 | `daemon/src/db/schema.ts` | Modify | Token usage migration |
| 13 | `daemon/src/orchestrator/compressor.ts` | Modify | Tool summary preservation |
| 13 | `daemon/src/db/sqlite/memory-repo.ts` | Modify | Memory tier field |
| 13 | `daemon/src/orchestrator/context-builder.ts` | Modify | Tier-based injection |
| 14 | `daemon/src/scheduler.ts` | Modify | Cron task system |
| 14 | `daemon/src/sensors/` | Create | Resource sensing directory |
| 15 | `daemon/src/db/schema.ts` | Modify | parentMessageId for branching |
| 15 | `daemon/src/db/conversation-repo.ts` | Modify | FTS5, branching queries |
| 15 | `daemon/src/api/conversations.ts` | Modify | Edit/regenerate/export endpoints |
| 16 | `frontend/src/hooks/useASR.ts` | Create | Extracted ASR hook |
| 16 | `frontend/src/hooks/useTTSPlayback.ts` | Create | Extracted TTS hook |
| 16 | `frontend/src/hooks/useBargeIn.ts` | Create | Extracted barge-in hook |
| 16 | `frontend/src/hooks/useVoiceFSM.ts` | Create | Top-level voice state machine |
| 16 | `frontend/src/hooks/useVoiceConversation.ts` | Refactor | Slim down to compose new hooks |

---

## Session Continuity Notes

When resuming work in a new session:

1. Read `docs/research/2026-06-03-competitive-analysis-and-optimization-roadmap.md` for full analysis
2. Read this task list for current progress
3. Check `git log --oneline -10` for recent changes
4. The next uncompleted phase starts the work
5. Each phase MUST be committed individually after all tests pass

## Per-Phase Workflow

Each phase MUST be committed individually after all tests pass. Do not batch multiple phases into one commit.

1. Create a new branch from main: `feat/optimization-phase-N`
2. Implement all items in the phase
3. Run full test suite (`pnpm -r test`) — must pass with 0 failures
4. Run typecheck (`pnpm -r typecheck`) — must pass clean
5. Commit with a descriptive message following conventional commits format
6. Verify commit with `git log --oneline -1`
7. **Generate the next phase's execution prompt** for the user to copy into a new session
8. Hand the prompt to a new session to continue
