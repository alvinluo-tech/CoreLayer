import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceFSM } from './useVoiceFSM';

const asrMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(() => ''),
  transcribeWithWhisper: vi.fn(),
  state: {
    interimTranscript: '',
    finalTranscript: '',
    isListening: false,
    error: null as string | null,
  },
}));

// Mock all dependencies
vi.mock('@/lib/tauri', () => ({
  getDaemonUrl: vi.fn(() => Promise.resolve('http://localhost:3001')),
}));

vi.mock('@/lib/sentenceSplitter', () => ({
  splitSentences: vi.fn(() => ({ complete: [], remainder: '' })),
}));

vi.mock('@/lib/voiceProfile', () => ({
  voiceProfileManager: {
    getVoiceName: vi.fn(() => 'test-voice'),
    getTTSModel: vi.fn(() => 'test-model'),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/jarvisClient', () => ({
  jarvisClient: {
    synthesize: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
    transcribe: vi.fn(),
  },
}));

vi.mock('@/lib/voiceUtils', () => ({
  getSpokenText: vi.fn((t: string) => t),
  playSciFiChime: vi.fn(),
  HALLUCINATION_PATTERNS: [],
}));

vi.mock('@/stores/dataPanelStore', () => ({
  useDataPanelStore: {
    getState: vi.fn(() => ({
      addEntry: vi.fn(),
    })),
  },
}));

vi.mock('./voiceRealtimeSession', () => ({
  createConnectRealtimeSession: vi.fn(() => vi.fn()),
}));

vi.mock('./useASR', () => ({
  useASR: vi.fn(() => ({
    ...asrMock.state,
    start: asrMock.start,
    stop: asrMock.stop,
    transcribeWithWhisper: asrMock.transcribeWithWhisper,
  })),
}));

vi.mock('./useTTSPlayback', () => ({
  useTTSPlayback: vi.fn(() => ({
    isPlaying: false,
    currentSentence: 0,
    totalSentences: 0,
    createQueue: vi.fn(() => ({
      enqueue: vi.fn(),
      enqueueBatch: vi.fn(() => Promise.resolve()),
      setTotalExpected: vi.fn(),
      waitForCompletion: vi.fn(() => Promise.resolve()),
      stop: vi.fn(),
      setVolume: vi.fn(),
      getVolume: vi.fn(() => 0),
      dispose: vi.fn(),
      isPlaying: false,
    })),
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(() => Promise.resolve()),
    setTotalExpected: vi.fn(),
    waitForCompletion: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 0),
    dispose: vi.fn(),
  })),
}));

vi.mock('./useBargeIn', () => ({
  useBargeIn: vi.fn(() => ({
    isMonitoring: false,
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('./useConnectionHealth', () => ({
  useConnectionHealth: vi.fn(() => ({
    isConnected: true,
    lastCheckTime: null,
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

describe('useVoiceFSM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asrMock.state.interimTranscript = '';
    asrMock.state.finalTranscript = '';
    asrMock.state.isListening = false;
    asrMock.state.error = null;
    asrMock.stop.mockReturnValue('');
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    expect(result.current.state).toBe('idle');
    expect(result.current.interimTranscript).toBe('');
    expect(result.current.finalTranscript).toBe('');
    expect(result.current.assistantText).toBe('');
    expect(result.current.lastError).toBeNull();
  });

  it('stopConversation resets to idle', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.stopConversation();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.lastError).toBeNull();
  });

  it('startListening transitions to listening', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.startListening();
    });

    expect(result.current.state).toBe('listening');
  });

  it('does not stop ASR on window blur while actively listening after wake', () => {
    asrMock.state.isListening = true;
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.startListening();
    });
    expect(result.current.state).toBe('listening');

    act(() => {
      result.current.handleWindowBlur();
    });

    expect(asrMock.stop).not.toHaveBeenCalled();
    expect(result.current.state).toBe('listening');
  });

  it('startListening ignores duplicate when active', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.startListening();
    });

    // Second call should be ignored (isActiveRef is true)
    act(() => {
      result.current.startListening();
    });

    expect(result.current.state).toBe('listening');
  });

  it('finishListening in non-listening state is no-op', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.finishListening();
    });

    expect(result.current.state).toBe('idle');
  });

  it('restoreState sets the specified state', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.restoreState('speaking', '', '', 'Hello');
    });

    expect(result.current.state).toBe('speaking');
  });

  it('clearLastStreamedText clears refs', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.clearLastStreamedText();
    });

    // No error thrown
    expect(result.current.state).toBe('idle');
  });

  it('exposes all required interface methods', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    expect(typeof result.current.startListening).toBe('function');
    expect(typeof result.current.playGreetingAndListen).toBe('function');
    expect(typeof result.current.stopConversation).toBe('function');
    expect(typeof result.current.bargeIn).toBe('function');
    expect(typeof result.current.finishListening).toBe('function');
    expect(typeof result.current.handleWindowBlur).toBe('function');
    expect(typeof result.current.handleWindowFocus).toBe('function');
    expect(typeof result.current.startConversation).toBe('function');
    expect(typeof result.current.clearLastStreamedText).toBe('function');
    expect(typeof result.current.restoreState).toBe('function');
    expect(typeof result.current.retryLastAction).toBe('function');
  });

  it('retryLastAction is no-op when not in error state', () => {
    const { result } = renderHook(() => useVoiceFSM({ conversationId: null }));

    act(() => {
      result.current.retryLastAction();
    });

    expect(result.current.state).toBe('idle');
  });
});
