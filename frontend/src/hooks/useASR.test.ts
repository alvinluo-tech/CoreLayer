import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useASR } from './useASR';

// Mock webSpeechASR
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockUpdateOptions = vi.fn();
let asrOptions: Record<string, unknown> = {};

vi.mock('@/lib/webSpeechASR', () => ({
  isWebSpeechASRAvailable: vi.fn(() => true),
  createWebSpeechASR: vi.fn((opts) => {
    asrOptions = opts;
    return {
      start: mockStart,
      stop: mockStop,
      updateOptions: mockUpdateOptions,
      get isActive() {
        return true;
      },
    };
  }),
}));

vi.mock('@/lib/audioCapture', () => ({
  startAudioCapture: vi.fn(),
  encodeWav: vi.fn(() => new Blob(['fake'], { type: 'audio/wav' })),
}));

vi.mock('@/lib/jarvisClient', () => ({
  jarvisClient: {
    transcribe: vi.fn(),
  },
}));

vi.mock('@/lib/voiceUtils', () => ({
  HALLUCINATION_PATTERNS: ['请不吝点赞', '订阅'],
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useASR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    asrOptions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useASR());

    expect(result.current.interimTranscript).toBe('');
    expect(result.current.finalTranscript).toBe('');
    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('start creates ASR and begins listening', () => {
    const { result } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    expect(mockStart).toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);
  });

  it('stop returns accumulated text and stops ASR', () => {
    const { result } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    // Simulate some final text received
    act(() => {
      (asrOptions.onFinal as unknown as (value: string) => void)('你好');
    });

    let text = '';
    act(() => {
      text = result.current.stop();
    });

    expect(text).toBe('你好');
    expect(mockStop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('onFinal updates finalTranscript', () => {
    const { result } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    act(() => {
      (asrOptions.onFinal as unknown as (value: string) => void)('测试文本');
    });

    expect(result.current.finalTranscript).toBe('测试文本');
    expect(result.current.interimTranscript).toBe('');
  });

  it('onInterim updates interimTranscript', () => {
    const { result } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    act(() => {
      (asrOptions.onInterim as unknown as (value: string) => void)('中间');
    });

    expect(result.current.interimTranscript).toBe('中间');
  });

  it('safety timeout fires onEnd with empty text', () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useASR({ onEnd }));

    act(() => {
      result.current.start({ silenceTimeout: 4000 });
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onEnd).toHaveBeenCalledWith('');
    expect(result.current.isListening).toBe(false);
  });

  it('clears safety timer when interim result received', () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useASR({ onEnd }));

    act(() => {
      result.current.start({ silenceTimeout: 4000 });
    });

    // Receive interim before timeout
    act(() => {
      vi.advanceTimersByTime(3000);
      (asrOptions.onInterim as unknown as (value: string) => void)('hello');
    });

    // Advance past timeout - should not fire because timer was cleared
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // onEnd should not have been called by the safety timer
    expect(onEnd).not.toHaveBeenCalledWith('');
  });

  it('stop accumulates interim and final text', () => {
    const { result } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    act(() => {
      (asrOptions.onFinal as unknown as (value: string) => void)('你好');
      (asrOptions.onInterim as unknown as (value: string) => void)('世界');
    });

    let text = '';
    act(() => {
      text = result.current.stop();
    });

    expect(text).toBe('你好世界');
  });

  it('cleanup stops ASR on unmount', () => {
    const { result, unmount } = renderHook(() => useASR());

    act(() => {
      result.current.start();
    });

    unmount();

    expect(mockStop).toHaveBeenCalled();
  });
});
