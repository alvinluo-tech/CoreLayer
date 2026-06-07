import { describe, it, expect } from 'vitest';
import type { ApprovalRequiredResult, OperationKind, ToolExecutePayload } from './approval.js';
import { isApprovalRequiredResult } from './approval.js';

describe('ApprovalRequiredResult', () => {
  it('has correct shape', () => {
    const result: ApprovalRequiredResult = {
      kind: 'approval_required',
      approvalRequestId: 'req-1',
      runId: 'run-1',
      toolCallId: 'tc-1',
      toolId: 'shell',
      toolName: 'shell.execute',
      operationKind: 'tool.execute',
      operationPayload: { args: { command: 'ls' } },
      actor: 'ai',
      mode: 'chat',
      projectId: null,
      taskId: null,
      conversationId: 'conv-1',
      source: 'native',
      preview: 'Execute shell command',
      risk: 'high',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };

    expect(result.kind).toBe('approval_required');
    expect(result.operationKind).toBe('tool.execute');
    expect(result.operationPayload).toEqual({ args: { command: 'ls' } });
  });

  it('is JSON-serializable (no functions)', () => {
    const result: ApprovalRequiredResult = {
      kind: 'approval_required',
      approvalRequestId: 'req-1',
      runId: 'run-1',
      toolCallId: null,
      toolId: 'shell',
      toolName: 'shell.execute',
      operationKind: 'tool.execute',
      operationPayload: { args: { command: 'ls' } },
      actor: 'ai',
      mode: 'chat',
      projectId: 'proj-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      source: 'native',
      preview: 'Execute shell command',
      risk: 'high',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };

    const serialized = JSON.stringify(result);
    const deserialized = JSON.parse(serialized) as ApprovalRequiredResult;

    expect(deserialized.kind).toBe('approval_required');
    expect(deserialized.approvalRequestId).toBe('req-1');
    expect(deserialized.operationPayload).toEqual({ args: { command: 'ls' } });
  });
});

describe('isApprovalRequiredResult', () => {
  it('returns true for valid result', () => {
    expect(
      isApprovalRequiredResult({
        kind: 'approval_required',
        approvalRequestId: 'req-1',
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isApprovalRequiredResult(null)).toBe(false);
  });

  it('returns false for wrong kind', () => {
    expect(isApprovalRequiredResult({ kind: 'success' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isApprovalRequiredResult('approval_required')).toBe(false);
    expect(isApprovalRequiredResult(42)).toBe(false);
  });
});

describe('OperationKind type', () => {
  it('accepts tool.execute', () => {
    const kind: OperationKind = 'tool.execute';
    expect(kind).toBe('tool.execute');
  });
});

describe('ToolExecutePayload type', () => {
  it('has args field', () => {
    const payload: ToolExecutePayload = { args: { key: 'value' } };
    expect(payload.args).toEqual({ key: 'value' });
  });
});
