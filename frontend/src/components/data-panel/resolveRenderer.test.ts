import { describe, it, expect } from 'vitest';
import { resolveRenderer } from './resolveRenderer';

describe('resolveRenderer', () => {
  it('should return hint renderer when renderHint provided', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      renderHint: { type: 'stats', stats: ['count'] },
    });
    expect(result.type).toBe('stats');
    expect(result.source).toBe('hint');
  });

  it('should return schema renderer when dataView schema provided', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      schema: { type: 'list', title: 'Items', itemShape: { primary: 'name' } },
    });
    expect(result.type).toBe('list');
    expect(result.source).toBe('schema');
  });

  it('should prefer hint over schema', () => {
    const result = resolveRenderer({
      data: [{ name: 'test' }],
      schema: { type: 'list', itemShape: { primary: 'name' } },
      renderHint: { type: 'stats' },
    });
    expect(result.type).toBe('stats');
    expect(result.source).toBe('hint');
  });

  it('should detect list from array of objects', () => {
    const result = resolveRenderer({
      data: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    });
    expect(result.type).toBe('list');
    expect(result.source).toBe('heuristic');
  });

  it('should use ViewModel kind when provided', () => {
    const result = resolveRenderer({
      data: { foo: 'bar' },
      viewModel: {
        id: 'test',
        source: { toolName: 'test', timestamp: '' },
        title: 'Test',
        kind: 'adaptive',
        density: 'detailed',
      },
    });
    expect(result.type).toBe('adaptive');
  });

  it('should extract array from wrapper object when ViewModel kind is list', () => {
    const tasks = [
      { id: 1, title: 'Task 1', status: 'pending' },
      { id: 2, title: 'Task 2', status: 'done' },
    ];
    const result = resolveRenderer({
      data: { tasks, count: 2 },
      viewModel: {
        id: 'test',
        source: { toolName: 'test', timestamp: '' },
        title: 'Tasks',
        kind: 'list',
        density: 'detailed',
      },
    });
    expect(result.type).toBe('list');
    expect(result.data).toEqual(tasks);
  });

  it('should fall back to generic for plain data', () => {
    const result = resolveRenderer({ data: { foo: 'bar' } });
    expect(result.type).toBe('generic');
    expect(result.source).toBe('fallback');
  });

  it('should fall back to generic for null data', () => {
    const result = resolveRenderer({ data: null });
    expect(result.type).toBe('generic');
    expect(result.source).toBe('fallback');
  });
});
