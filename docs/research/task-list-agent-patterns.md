# Agent Patterns Implementation Task List

**Branch**: `feat/agent-patterns-research`
**Created**: 2026-06-03
**Reference**: [Research Brief](./2026-06-03-agent-patterns-comparative-analysis.md)

---

## Status Legend

- [x] Done
- [~] In Progress
- [ ] Todo
- [!] Blocked

---

## Phase 1: Context Manager

> Source: Hermes (dual-layer) + Odysseus (token estimation)
> Files: `daemon/src/orchestrator/context-manager.ts`

- [x] Create `context-manager.ts`
- [x] `estimateTokens(text)` — CJK-tuned heuristic (0.45 ratio)
- [x] `estimateMessagesTokens(messages)` — array of ModelMessage
- [x] `getContextWindow(modelName)` — known window lookup table
- [x] `computeContextBudget(model, systemTokens, memoryTokens)` — budget allocation
- [x] `shouldCompress(historyTokens, budget, msgCount)` — dual-layer trigger (50% soft / 85% hard)
- [x] `selectHistoryWithinBudget(messages, budget)` — token-budgeted history selection
- [x] `assembleContext(model, systemPrompt, memories, history)` — full context assembly
- [x] Tests: 29 tests passing
- [x] Code review: HIGH double-count bug fixed, MEDIUM fallback toolCall estimation fixed, LOW role filter fixed

---

## Phase 2: Conversation Compressor

> Source: Hermes (pre-compaction flush) + Odysseus (structured summary)
> Files: `daemon/src/orchestrator/compressor.ts`

- [x] Create `compressor.ts`
- [x] `CompactionSummary` interface — structured output format
- [x] `SUMMARY_SYSTEM_PROMPT` — Chinese structured summary prompt
- [x] `sanitizeToolMessages(messages)` — two-pass orphan cleanup
- [x] `formatMessagesForSummary(messages)` — ROLE: text format, 2000 char truncation
- [x] `compressConversation(messages, conversationId)` — LLM-based summarization
- [x] `createSummaryMessage(conversationId, summary, count)` — summary message factory
- [x] Tests: 11 tests passing
- [x] Code review: fixed unused imports

---

## Phase 3: Integration into Conversation Orchestrator

> Files: `daemon/src/orchestrator/conversation.ts`

- [x] Import ContextManager and Compressor
- [x] Add `fetchRelevantMemories()` helper
- [x] `handleMessageInConversation` — replace `slice(-20)` with `assembleContext`
- [x] `handleMessageInConversation` — add compression trigger after assistant message saved
- [x] `streamMessageInConversation` — replace `slice(-20)` with `assembleContext`
- [x] `streamMessageInConversation` — add compression trigger with re-fetch
- [x] Code review: MEDIUM stale history fixed (re-fetch messages before compression)
- [x] Code review: LOW console.log removed

---

## Phase 4: Memory Enhancement

> Source: Odysseus (category boosts) + Hermes (security scanning)
> Files: `daemon/src/db/sqlite/memory-repo.ts`, `daemon/src/db/repository.ts`

- [x] Add relevance scoring with category boosts
  - preference: 1.2x multiplier
  - context: 1.1x
  - fact/summary: 1.0x
- [x] Add usage tracking — `incrementUses()` on memory injection
- [x] Add deduplication on insert — case-insensitive exact match
- [x] Add prompt injection scanning on memory writes (Hermes `_scan_memory_content` pattern)
  - Block patterns: `ignore previous`, `system:`, `assistant:`, exfiltration attempts
- [x] Upgrade retrieval from `LIKE %query%` to scored ranking (Jaccard + category/confidence boosts)
- [x] Add `MemoryRow.uses` field to schema (migration)
- [x] Tests for all new memory behaviors (32 tests)

---

## Phase 5: Smart Prompt Assembly (ContextBuilder)

> Source: OpenClaw (context engine) + Odysseus (layered assembly)
> Files: `daemon/src/orchestrator/context-builder.ts`

- [x] Refactor `buildSystemPrompt` into `ContextBuilder` class
- [x] Dynamic tool catalog — only relevant tools, not all
  - Keyword + description overlap scoring (Odysseus pattern)
  - Budget: 16 tools max
- [x] Selective memory injection — top-K by relevance score (15 max)
- [x] Token-budget-aware truncation for system prompt sections
  - Tool catalog: 3000 tokens, Memory: 2000, Summary: 1500
  - Head/tail (70/30) truncation with notice
- [x] Conversation summary injection (from compressor output)
  - Extracts `[对话摘要]` messages from history
- [x] Context inspection debug endpoint (OpenClaw `/context` pattern)
  - `POST /api/chat/debug/context` — per-component token usage, memory items, tool catalog
- [x] Tests: 19 tests passing
- [x] Integration: conversation.ts, chat.ts, voice.ts updated
- [x] Full suite: 361 tests passing

---

## Phase 6: Voice Barge-in

> Source: BaiLongma (two-stage interruption)
> Files: `frontend/src/` (voice panel), `daemon/src/voice/`

- [x] Frontend: microphone volume monitoring during TTS playback
- [x] Stage 1 — Ducking: volume > threshold for ~50ms → reduce TTS volume
- [x] Stage 2 — Confirmation: sustained for ~160ms → stop TTS completely
- [x] Pre-buffering: circular buffer of PCM chunks during TTS
- [x] Send buffered audio to ASR on barge-in
- [x] False-positive recovery: no speech in 3.5s → resume TTS
- [x] Voice-specific system prompt (BaiLongma pattern)
  - Natural speech, no Markdown
  - Ignore garbled ASR errors
  - Concise responses (60-150 chars)
- [x] Tests for barge-in state machine (15 tests)

---

## Phase 7: Anthropic Prompt Caching

> Source: Odysseus (`cache_control` breakpoints)
> Files: `daemon/src/orchestrator/conversation.ts`, `daemon/src/orchestrator/context-builder.ts`

- [x] Add `cache_control: {"type": "ephemeral"}` to last system message
  - When tools are present OR system text > 4000 chars
- [x] Add `cache_control` to last tool schema definition
- [x] Verify with Anthropic API that cache breakpoints work
- [x] Log cache hit/miss stats for monitoring
- [x] Tests: 15 tests passing

---

## Phase 8: Agent Loop Enhancements

> Source: Hermes (IterationBudget) + Odysseus (completion verifier)
> Files: `daemon/src/orchestrator/conversation.ts`

- [ ] Make max steps configurable (default 20, currently hardcoded 5)
- [ ] Add `IterationBudget` with pressure warnings injected into tool results
  - At 80% budget: inject "Please consolidate and wrap up"
- [ ] Add empty response guard for thinking models
  - If model returns empty text but has reasoning content, produce fallback
- [ ] Add completion verifier for effectful tool turns
  - Sub-agent with fresh context verifies task completion
  - Max 2 re-verify cycles
- [ ] Tool result size limiting
  - Soft-trim oversized results (keep head + tail)
  - Max ~4000 chars per tool result

---

## Phase 9: Model Routing Enhancements

> Source: Odysseus (fallback chains, dead host) + Hermes (provider resolver)
> Files: `daemon/src/ai/provider.ts`, `daemon/src/model/gateway.ts`

- [ ] Fallback chains — try ordered list of providers on failure
- [ ] Dead host management — 2 failures → 20s cooldown
- [ ] Provider auto-detection from URL hostname
- [ ] Model-specific adaptations
  - `max_completion_tokens` for reasoning models (o1/o3/o4)
  - Omit temperature for reasoning models
  - Anthropic temperature clamped to [0.0, 1.0]
- [ ] Response caching (Odysseus SHA-256 128-entry LRU)

---

## Phase 10: Streaming Enhancements

> Source: Odysseus (normalized SSE) + OpenClaw (event-driven)
> Files: `daemon/src/api/chat.ts`

- [ ] Normalize streaming events across providers
  - `delta` for text chunks
  - `thinking` for reasoning tokens
  - `tool_calls` for tool invocations
  - `error` for errors
  - `[DONE]` for termination
- [ ] Handle provider quirks
  - Gemini missing tool call index
  - vLLM `reasoning_content` field
- [ ] Connection pooling (httpx-style)
- [ ] Stream timeout with granular config

---

## Quick Reference: File Map

| File | Status | Description |
|------|--------|-------------|
| `daemon/src/orchestrator/context-manager.ts` | Done | Token estimation, budget, context assembly |
| `daemon/src/orchestrator/context-manager.test.ts` | Done | 29 tests |
| `daemon/src/orchestrator/compressor.ts` | Done | LLM compression, tool sanitization |
| `daemon/src/orchestrator/compressor.test.ts` | Done | 11 tests |
| `daemon/src/orchestrator/conversation.ts` | Done | Integrated context manager + compressor |
| `daemon/src/db/sqlite/memory-repo.ts` | Done | Phase 4: scored ranking, dedup, injection scan, usage tracking |
| `daemon/src/db/sqlite/memory-repo.test.ts` | Done | Phase 4: 31 tests |
| `daemon/src/orchestrator/context-builder.ts` | Done | Phase 5: ContextBuilder class, tool selection, memory injection |
| `daemon/src/orchestrator/context-builder.test.ts` | Done | Phase 5: 19 tests |
| `daemon/src/orchestrator/prompt-builder.ts` | Done | Phase 5: legacy, superseded by context-builder |
| `frontend/src/lib/bargeInStateMachine.ts` | Done | Phase 6: two-stage barge-in state machine |
| `frontend/src/lib/bargeInStateMachine.test.ts` | Done | Phase 6: 9 tests |
| `frontend/src/lib/circularPCMBuffer.ts` | Done | Phase 6: ring buffer for pre-buffering |
| `frontend/src/lib/circularPCMBuffer.test.ts` | Done | Phase 6: 6 tests |
| `frontend/src/lib/audioQueue.ts` | Done | Phase 6: setVolume ducking support |
| `frontend/src/hooks/useVoiceConversation.ts` | Done | Phase 6: integrated two-stage barge-in + false-positive recovery |
| `daemon/src/orchestrator/cache-control.test.ts` | Done | Phase 7: 15 tests — cache conditions, immutability, stats |
| `daemon/src/ai/provider.ts` | Todo | Phase 9: routing |
| `daemon/src/api/chat.ts` | Todo | Phase 10: streaming |

---

## Session Continuity Notes

When resuming work in a new session:

1. Read this task list first to understand current progress
2. Read `docs/research/2026-06-03-agent-patterns-comparative-analysis.md` for full context
3. Check `git log --oneline -10` on branch `feat/agent-patterns-research`
4. The next uncompleted item is in **Phase 7: Anthropic Prompt Caching**
5. All Phase 1-6 items are complete and tested (361 daemon + 119 frontend tests passing)

## Per-Phase Commit Workflow

Each phase MUST be committed individually after all tests pass. Do not batch multiple phases into one commit.

1. Implement all items in the phase
2. Run full test suite (`pnpm -r test`) — must pass with 0 failures
3. Run typecheck (`pnpm -r typecheck`) — must pass clean
4. Commit with a descriptive message following conventional commits format
5. Verify commit with `git log --oneline -1`
6. Move to the next phase
