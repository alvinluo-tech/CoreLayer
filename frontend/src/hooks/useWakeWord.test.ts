import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeWord } from './useWakeWord';

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useWakeWord', () => {
  const speechWindow = window as unknown as Record<string, unknown>;
  const originalSpeechRecognition = speechWindow.SpeechRecognition;
  const originalWebkitSpeechRecognition = speechWindow.webkitSpeechRecognition;

  let instances: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onresult: unknown;
    onerror: unknown;
    onend: unknown;
    onstart: unknown;
  }>;

  beforeEach(() => {
    instances = [];

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 0;
      onresult = null;
      onerror = null;
      onend = null;
      onstart = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();

      constructor() {
        instances.push(this);
      }
    }

    speechWindow.SpeechRecognition = MockSpeechRecognition;
    speechWindow.webkitSpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    speechWindow.SpeechRecognition = originalSpeechRecognition;
    speechWindow.webkitSpeechRecognition = originalWebkitSpeechRecognition;
    vi.clearAllMocks();
  });

  it('stops the active Web Speech recognizer even when called through an early stop reference', async () => {
    const { result } = renderHook(() => useWakeWord(vi.fn()));
    const earlyStop = result.current.stop;

    await act(async () => {
      await result.current.start();
    });

    expect(instances).toHaveLength(1);

    await act(async () => {
      await earlyStop();
    });

    expect(instances[0]?.abort).toHaveBeenCalledOnce();
  });
});
