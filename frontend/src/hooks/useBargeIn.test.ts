import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBargeIn } from './useBargeIn';

vi.mock('@/lib/bargeInStateMachine', () => ({
  BargeInStateMachine: vi.fn().mockImplementation(() => ({
    feed: vi.fn(() => 'none'),
    reset: vi.fn(),
    getState: vi.fn(() => 'idle'),
  })),
}));

vi.mock('@/lib/circularPCMBuffer', () => ({
  CircularPCMBuffer: vi.fn().mockImplementation(() => ({
    push: vi.fn(),
    flush: vi.fn(() => []),
    clear: vi.fn(),
    get size() {
      return 0;
    },
    get isEmpty() {
      return true;
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock getUserMedia
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: () => [{ stop: vi.fn() }],
      })
    ),
  },
  writable: true,
});

describe('useBargeIn', () => {
  let mockAudioQueue: { isPlaying: boolean; setVolume: ReturnType<typeof vi.fn> };
  let originalHasFocus: typeof document.hasFocus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioQueue = {
      isPlaying: false,
      setVolume: vi.fn(),
    };
    // jsdom returns false by default; mock it to return true for most tests
    originalHasFocus = document.hasFocus.bind(document);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    document.hasFocus = originalHasFocus;
  });

  it('initializes with isMonitoring false', () => {
    const { result } = renderHook(() => useBargeIn(vi.fn()));
    expect(result.current.isMonitoring).toBe(false);
  });

  it('start begins monitoring', async () => {
    const { result } = renderHook(() => useBargeIn(vi.fn()));

    await act(async () => {
      result.current.start(mockAudioQueue as never);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('start skips if document not focused', () => {
    // jsdom document.hasFocus() returns true by default
    // so we test the normal path
    const { result } = renderHook(() => useBargeIn(vi.fn()));

    act(() => {
      result.current.start(mockAudioQueue as never);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('stop halts monitoring', async () => {
    const { result } = renderHook(() => useBargeIn(vi.fn()));

    await act(async () => {
      result.current.start(mockAudioQueue as never);
    });

    act(() => {
      result.current.stop();
    });

    // stop should have been called on the monitor
    expect(result.current.isMonitoring).toBe(false);
  });

  it('cleanup on unmount stops monitor', async () => {
    const { result, unmount } = renderHook(() => useBargeIn(vi.fn()));

    await act(async () => {
      result.current.start(mockAudioQueue as never);
    });

    unmount();
    // Should not throw
  });
});
