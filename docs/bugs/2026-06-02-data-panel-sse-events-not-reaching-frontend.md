# Data Panel SSE Events Not Reaching Frontend

**Date:** 2026-06-02
**Component:** `daemon/src/api/conversations.ts`, `daemon/src/orchestrator/conversation.ts`
**Severity:** High (feature completely non-functional)
**Status:** Fixed

## Symptom

Data Panel (floating visualization for tool call results) never appeared when tools were called via AI chat. The panel's Zustand store always had `entries: 0, isVisible: false`.

## Root Causes (3 bugs)

### Bug 1: `sseStreamRef` null when `onStepFinish` fires

`streamMessageInConversation()` was called **outside** the `streamSSE()` callback, but `sseStreamRef` was declared **after** it. The `onStepFinish` callback captured `sseStreamRef` by reference, but it was still `null` when the callback fired during text stream consumption. The `?.` operator silently swallowed the null writes.

**Fix:** Moved `streamMessageInConversation()` inside the `streamSSE()` callback, passing `sseStream` directly (no ref needed).

### Bug 2: SSE writes were fire-and-forget

`onStepFinish` callback called `sseStream.writeSSE().catch(() => {})` without `await`. The callback returned before writes completed, so the `done` event was sent immediately after, closing the connection before `tool-call`/`tool-result` events were flushed.

**Fix:** Made the callback `async` and `await`ed each `writeSSE()` call.

### Bug 3: AI SDK v6 field names (`input`/`output`, not `args`/`result`)

The `onStepFinish` callback accessed `step.toolCalls[].args` and `step.toolResults[].result`, but Vercel AI SDK v6 uses `input` and `output` respectively:

```typescript
// StepResult<TOOLS> in ai@6.x
type StaticToolCall = { toolName: string; toolCallId: string; input: ... }  // NOT args
type StaticToolResult = { toolName: string; toolCallId: string; output: ... }  // NOT result
```

Both `args` and `result` were `undefined`, so `JSON.stringify` produced `{}` objects. The frontend SSE parser received the events but `JSON.parse` either produced empty payloads or the `tool-result` handler silently failed.

**Fix:** Changed to `tc.input` and `tr.output` with fallbacks (`tc.input ?? tc.args`, `tr.output ?? tr.result`).

## Debugging Process

1. Added file-based logging (`appendFileSync`) to `onStepFinish` callback — confirmed it fired with correct tool calls
2. Added logging to SSE emission — confirmed events were written to stream
3. Tested SSE endpoint with `curl -v -N` — confirmed events were sent over HTTP
4. Added `console.log` to frontend SSE parser — confirmed parser received events
5. Added `console.log` to `useChat.ts` `tool-result` handler — confirmed it never fired
6. Checked Vercel AI SDK v6 types — discovered `input`/`output` vs `args`/`result` mismatch

## Key Takeaway

When debugging SSE event flow, verify the **full pipeline**: backend emission -> HTTP transport -> frontend parser -> event handler -> store update. The `curl -v -N` test was the turning point — it confirmed events were sent, narrowing the problem to the payload content (empty due to wrong field names).
