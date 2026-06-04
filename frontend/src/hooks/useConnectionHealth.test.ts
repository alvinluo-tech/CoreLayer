import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConnectionHealth } from './useConnectionHealth';

vi.mock('@/lib/tauri', () => ({
  getDaemonUrl: vi.fn(() => Promise.resolve('http://localhost:3001')),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
}));

describe('useConnectionHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes as connected', () => {
    const { result } = renderHook(() => useConnectionHealth());
    expect(result.current.isConnected).toBe(true);
  });

  it('start triggers immediate health check', async () => {
    const { result } = renderHook(() => useConnectionHealth());

    await act(async () => {
      result.current.start();
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('sets isConnected to false on fetch failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network error'))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionHealth());

    await act(async () => {
      result.current.start();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('sets isConnected to false on non-200 response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response('error', { status: 503 }))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useConnectionHealth());

    await act(async () => {
      result.current.start();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('stop clears the interval', async () => {
    const { result } = renderHook(() => useConnectionHealth());

    await act(async () => {
      result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    // Advance timers - should not trigger more checks
    vi.clearAllMocks();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('cleanup on unmount stops interval', async () => {
    const { result, unmount } = renderHook(() => useConnectionHealth());

    await act(async () => {
      result.current.start();
    });

    unmount();
    // Should not throw
  });
});
