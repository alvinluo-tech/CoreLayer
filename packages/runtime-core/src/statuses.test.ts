import { describe, it, expect } from 'vitest';
import {
  RunStatuses,
  TaskStatuses,
  RunModes,
  isRunStatus,
  isTaskStatus,
  isActiveRun,
  isTerminalRun,
  ACTIVE_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
} from './statuses.js';

describe('RunStatuses', () => {
  it('defines all expected statuses', () => {
    expect(RunStatuses.QUEUED).toBe('queued');
    expect(RunStatuses.RUNNING).toBe('running');
    expect(RunStatuses.SUCCEEDED).toBe('succeeded');
    expect(RunStatuses.FAILED).toBe('failed');
    expect(RunStatuses.CANCELLED).toBe('cancelled');
    expect(RunStatuses.WAITING_FOR_APPROVAL).toBe('waiting_for_approval');
  });

  it('isRunStatus returns true for valid statuses', () => {
    expect(isRunStatus('queued')).toBe(true);
    expect(isRunStatus('running')).toBe(true);
    expect(isRunStatus('succeeded')).toBe(true);
    expect(isRunStatus('failed')).toBe(true);
    expect(isRunStatus('cancelled')).toBe(true);
    expect(isRunStatus('waiting_for_approval')).toBe(true);
  });

  it('isRunStatus returns false for invalid values', () => {
    expect(isRunStatus('unknown')).toBe(false);
    expect(isRunStatus('')).toBe(false);
    expect(isRunStatus(null)).toBe(false);
    expect(isRunStatus(42)).toBe(false);
  });
});

describe('TaskStatuses', () => {
  it('defines all expected statuses', () => {
    expect(TaskStatuses.DRAFT).toBe('draft');
    expect(TaskStatuses.QUEUED).toBe('queued');
    expect(TaskStatuses.RUNNING).toBe('running');
    expect(TaskStatuses.COMPLETED).toBe('completed');
    expect(TaskStatuses.FAILED).toBe('failed');
    expect(TaskStatuses.CANCELLED).toBe('cancelled');
  });

  it('isTaskStatus returns true for valid statuses', () => {
    expect(isTaskStatus('draft')).toBe(true);
    expect(isTaskStatus('in_progress')).toBe(true);
    expect(isTaskStatus('done')).toBe(true);
  });

  it('isTaskStatus returns false for invalid values', () => {
    expect(isTaskStatus('unknown')).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
  });
});

describe('RunModes', () => {
  it('defines all expected modes', () => {
    expect(RunModes.CHAT).toBe('chat');
    expect(RunModes.VOICE).toBe('voice');
    expect(RunModes.WORKFLOW).toBe('workflow');
    expect(RunModes.REGENERATE).toBe('regenerate');
  });
});

describe('isActiveRun / isTerminalRun', () => {
  it('queued and running are active', () => {
    expect(isActiveRun('queued')).toBe(true);
    expect(isActiveRun('running')).toBe(true);
  });

  it('succeeded/failed/cancelled are not active', () => {
    expect(isActiveRun('succeeded')).toBe(false);
    expect(isActiveRun('failed')).toBe(false);
    expect(isActiveRun('cancelled')).toBe(false);
  });

  it('succeeded/failed/cancelled are terminal', () => {
    expect(isTerminalRun('succeeded')).toBe(true);
    expect(isTerminalRun('failed')).toBe(true);
    expect(isTerminalRun('cancelled')).toBe(true);
  });

  it('queued/running are not terminal', () => {
    expect(isTerminalRun('queued')).toBe(false);
    expect(isTerminalRun('running')).toBe(false);
  });

  it('ACTIVE_RUN_STATUSES and TERMINAL_RUN_STATUSES are exhaustive', () => {
    const allStatuses = Object.values(RunStatuses);
    const covered = [...ACTIVE_RUN_STATUSES, ...TERMINAL_RUN_STATUSES];
    // waiting_for_approval is neither active nor terminal
    expect(covered.length + 1).toBe(allStatuses.length);
  });
});
