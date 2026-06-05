import { useState, useCallback, useRef, useEffect } from 'react';
import type { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { getDaemonUrl } from '@/lib/tauri';
import { splitSentences } from '@/lib/sentenceSplitter';
import { AudioQueueManager } from '@/lib/audioQueue';
import { voiceProfileManager } from '@/lib/voiceProfile';
import { logger } from '@/lib/logger';
import { jarvisClient } from '@/lib/jarvisClient';
import { startAudioCapture, encodeWav } from '@/lib/audioCapture';
import {
  createWebSpeechASR,
  isWebSpeechASRAvailable,
  type WebSpeechASR,
  type WebSpeechASROptions,
} from '@/lib/webSpeechASR';
import { HALLUCINATION_PATTERNS, getSpokenText, playSciFiChime } from '@/lib/voiceUtils';
import { BargeInStateMachine } from '@/lib/bargeInStateMachine';
import { CircularPCMBuffer } from '@/lib/circularPCMBuffer';
import { useDataPanelStore } from '@/stores/dataPanelStore';
import { createCleanup, createCleanupStreaming } from './voiceConversationCleanup';
import { createConnectRealtimeSession } from './voiceRealtimeSession';

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

export type VoiceConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'streaming'
  | 'speaking'
  | 'error';

export function useVoiceConversation(
  conversationId: string | null,
  onIdle?: () => void,
  createConversation?: () => Promise<{ id: string }>
) {
  const [state, setState] = useState<VoiceConversationState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'centered' | 'bottom-right'>('centered');
  const isAppFocusedRef = useRef(true);
  const originalBoundsRef = useRef<{
    size: PhysicalSize | null;
    position: PhysicalPosition | null;
  } | null>(null);

  const daemonUrlRef = useRef<string>('http://127.0.0.1:3001');
  const audioQueueRef = useRef<AudioQueueManager | null>(null);
  const webAsrRef = useRef<WebSpeechASR | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const prevStateRef = useRef<VoiceConversationState>('idle');
  const lastStreamedTextRef = useRef('');
  const postListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startConversationRef = useRef<(text: string) => void>(() => {});
  const lastUserTextRef = useRef('');
  const bargeInMonitorRef = useRef<{ stop: () => void } | null>(null);
  const bargeInRef = useRef<(preBufferedAudio?: Float32Array[]) => void>(() => {});
  const isFarewellPlayingRef = useRef(false);
  const playFarewellAndExitRef = useRef<() => void>(() => {});
  const greetingAudioCtxRef = useRef<AudioContext | null>(null);
  const greetingSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const localSpeakingAnalyserRef = useRef<AnalyserNode | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const listeningSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedFinalTextRef = useRef<string>('');

  // False-positive recovery: save TTS state for resume after spurious barge-in
  const savedAssistantTextForResumeRef = useRef<string>('');
  const falsePositiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazily get or create ASR instance, or update options if it already exists
  const getOrCreateASR = useCallback((options: WebSpeechASROptions) => {
    if (!webAsrRef.current) {
      if (isWebSpeechASRAvailable()) {
        webAsrRef.current = createWebSpeechASR(options);
      }
    } else {
      webAsrRef.current.updateOptions(options);
    }
    return webAsrRef.current!;
  }, []);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // Start post-conversation listening window (5s to speak, then wake word)
  const startPostConversationListen = useCallback(() => {
    logger.debug(
      `[VoiceConversation] startPostConversationListen called, isActive: ${isActiveRef.current}`
    );
    if (isActiveRef.current) return;
    logger.debug('[VoiceConversation] Starting post-conversation listen (5s window)');

    if (postListenTimerRef.current) {
      clearTimeout(postListenTimerRef.current);
      postListenTimerRef.current = null;
    }

    isActiveRef.current = true;
    setState('listening');
    setInterimTranscript('');
    setFinalTranscript('');

    if (isWebSpeechASRAvailable()) {
      let latestInterimText = '';
      accumulatedFinalTextRef.current = '';

      const asr = getOrCreateASR({
        lang: 'zh-CN',
        onInterim: (text: string) => {
          setInterimTranscript(text);
          latestInterimText = text;
        },
        onFinal: (text: string) => {
          accumulatedFinalTextRef.current += text;
          setFinalTranscript(accumulatedFinalTextRef.current);
          setInterimTranscript('');
          latestInterimText = '';
        },
        onError: (err: string) => {
          console.warn('[VoiceConversation] Post-listen ASR error:', err);
        },
        onEnd: () => {
          logger.debug('[VoiceConversation] Post-listen ASR ended');
          if (postListenTimerRef.current) {
            clearTimeout(postListenTimerRef.current);
            postListenTimerRef.current = null;
          }

          const textToSubmit = (accumulatedFinalTextRef.current + latestInterimText).trim();

          isActiveRef.current = false;
          if (textToSubmit) {
            logger.debug(
              '[VoiceConversation] Post-listen submitting accumulated text:',
              textToSubmit
            );
            startConversationRef.current(textToSubmit);
          } else {
            logger.debug('[VoiceConversation] Post-listen no speech detected, exiting...');
            playFarewellAndExitRef.current();
          }
        },
        silenceTimeout: 5000,
      });
      asr.start();
    } else {
      // No Web Speech API — fall back to immediate wake word
      console.warn('[VoiceConversation] Web Speech API not available, falling back to wake word');
      isActiveRef.current = false;
      playFarewellAndExitRef.current();
    }
  }, [getOrCreateASR]);

  // When transitioning to idle state, return to wake word mode
  useEffect(() => {
    if (state === 'idle' && prevStateRef.current !== 'idle') {
      logger.debug(
        `[VoiceConversation] Transition: ${prevStateRef.current} → idle, isActive: ${isActiveRef.current}`
      );
      if (isFarewellPlayingRef.current) {
        isFarewellPlayingRef.current = false;
        logger.debug('[VoiceConversation] Farewell completed. Back to wake word mode.');
      } else {
        logger.debug('[VoiceConversation] Stopped or timed out. Back to wake word mode.');
      }
      onIdleRef.current?.();
    }
    prevStateRef.current = state;
  }, [state]);

  const restoreWindow = useCallback(async () => {
    if (typeof window === 'undefined' || !originalBoundsRef.current) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const { size, position } = originalBoundsRef.current;

      logger.debug('[Tauri Window] Restoring original window bounds...', originalBoundsRef.current);
      await appWindow.setAlwaysOnTop(false).catch(() => {});
      await appWindow.setDecorations(false).catch(() => {});
      if (size) {
        await appWindow.setSize(size).catch(() => {});
      }
      if (position) {
        await appWindow.setPosition(position).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to restore window bounds:', e);
    } finally {
      originalBoundsRef.current = null;
    }
  }, []);

  // Synchronize Tauri Window bounds, decorations, and focus based on voice conversation state
  useEffect(() => {
    // We no longer manipulate the main window size/focus here to prevent focus-stealing
    // and allow normal multitasking. Let the main window behave normally.
    return;

    const isAssistant =
      typeof window !== 'undefined' && window.location.search.includes('assistant=true');
    if (isAssistant) return;

    const isActive = state !== 'idle';
    const syncWindow = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        if (isActive) {
          // If the app was not focused when triggered, shrink it and place in bottom-right
          if (!isAppFocusedRef.current) {
            logger.debug(
              '[Tauri Window] App not focused. Entering system-level bottom-right overlay mode...'
            );

            // Only capture original bounds if we haven't already
            if (!originalBoundsRef.current) {
              const size = await appWindow.outerSize().catch(() => null);
              const position = await appWindow.outerPosition().catch(() => null);
              originalBoundsRef.current = { size, position };
              logger.debug('[Tauri Window] Saved original bounds:', originalBoundsRef.current);
            }

            // Apply borderless, shrunken dimensions, always-on-top
            await appWindow.setDecorations(false).catch(() => {});
            await appWindow.setAlwaysOnTop(true).catch(() => {});

            const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi');
            await appWindow.setSize(new LogicalSize(360, 440)).catch(() => {});

            const { currentMonitor } = await import('@tauri-apps/api/window');
            const monitor = await currentMonitor().catch(() => null);
            if (monitor) {
              const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
              const scaleFactor = monitor.scaleFactor || 1;

              const workWidthLogical = workArea.size.width / scaleFactor;
              const workHeightLogical = workArea.size.height / scaleFactor;
              const workXLogical = workArea.position.x / scaleFactor;
              const workYLogical = workArea.position.y / scaleFactor;

              const winWidth = 360;
              const winHeight = 440;
              const margin = 20;

              const targetX = workXLogical + workWidthLogical - winWidth - margin;
              const targetY = workYLogical + workHeightLogical - winHeight - margin;

              await appWindow.setPosition(new LogicalPosition(targetX, targetY)).catch(() => {});
            }
          } else {
            logger.debug(
              '[Tauri Window] App is already focused. Showing centered overlay inside application.'
            );
            // Just ensure always on top without shrinking
            await appWindow.setAlwaysOnTop(true).catch(() => {});
          }

          await appWindow.show().catch(() => {});
          await appWindow.unminimize().catch(() => {});
          await appWindow.setFocus().catch(() => {});
        } else {
          logger.debug('[Tauri Window] Voice state is idle. Restoring window...');
          await restoreWindow();
        }
      } catch (e) {
        console.warn('[Tauri Window] Window manipulation failed:', e);
      }
    };
    syncWindow();
  }, [state, restoreWindow]);

  useEffect(() => {
    setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia) || isWebSpeechASRAvailable());
    getDaemonUrl()
      .then((url) => {
        daemonUrlRef.current = url;
      })
      .catch(() => {});
  }, []);

  // Cleanup refs object for extracted cleanup factories
  const cleanupRefs = {
    postListenTimerRef,
    breathingTimerRef,
    webAsrRef,
    listeningSafetyTimerRef,
    audioQueueRef,
    abortControllerRef,
    peerConnectionRef,
    localStreamRef,
    remoteAudioRef,
    dataChannelRef,
    greetingSourceRef,
    greetingAudioCtxRef,
    bargeInMonitorRef,
  };

  const cleanup = useCallback(() => {
    // Also stop barge-in monitor (not in the shared refs object for cleanup)
    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.stop();
      bargeInMonitorRef.current = null;
    }
    if (falsePositiveTimerRef.current) {
      clearTimeout(falsePositiveTimerRef.current);
      falsePositiveTimerRef.current = null;
    }
    savedAssistantTextForResumeRef.current = '';
    createCleanup(cleanupRefs as Parameters<typeof createCleanup>[0])();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cleanupStreaming = useCallback(() => {
    createCleanupStreaming(cleanupRefs)();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectRealtimeSession = useCallback(async () => {
    const realtimeRefs = {
      peerConnectionRef,
      localStreamRef,
      remoteAudioRef,
      dataChannelRef,
      isActiveRef,
    };
    const realtimeCallbacks = { setState, setAssistantText, setFinalTranscript, setLastError };
    await createConnectRealtimeSession(realtimeRefs, realtimeCallbacks)();
  }, []);

  // --- Batch ASR fallback (P0) ---
  const transcribeWithWhisper = useCallback(async (): Promise<string> => {
    const capture = await startAudioCapture();
    const SILENCE_THRESHOLD = 20;
    const SILENCE_DURATION = 2000;
    const MAX_RECORDING = 30000;

    return new Promise<string>((resolve) => {
      const dataArray = new Uint8Array(capture.analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const recordingStart = Date.now();

      const checkVAD = () => {
        if (!isActiveRef.current) {
          capture.stop();
          resolve('');
          return;
        }

        capture.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          capture.stop();
          processAudio();
          return;
        }

        if (Date.now() - recordingStart > MAX_RECORDING) {
          capture.stop();
          processAudio();
          return;
        }

        requestAnimationFrame(checkVAD);
      };

      const processAudio = async () => {
        const wavBlob = encodeWav(capture.pcmChunks, 16000);
        if (wavBlob.size < 2000) {
          resolve('');
          return;
        }

        try {
          const text = await jarvisClient.transcribe(wavBlob, 'zh');
          const trimmed = text?.trim() || '';
          const isHallucination = HALLUCINATION_PATTERNS.some((p) => trimmed.includes(p));
          resolve(isHallucination ? '' : trimmed);
        } catch (err) {
          console.warn('[VoiceConversation] transcribeWithWhisper failed:', err);
          resolve('');
        }
      };

      requestAnimationFrame(checkVAD);
    });
  }, []);

  // --- LLM Streaming ---
  const streamLLMResponse = useCallback(async function* (message: string, convId?: string | null) {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const response = await fetch(`${daemonUrlRef.current}/api/voice/converse-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId: convId || undefined,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Stream error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'delta';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (!data) continue;

          if (currentEvent === 'delta') {
            try {
              const payload = JSON.parse(data) as { text: string };
              yield payload.text;
            } catch {
              yield data;
            }
          } else if (currentEvent === 'thinking') {
            // Thinking tokens are not displayed in voice mode
          } else if (currentEvent === 'tool_calls') {
            // tool_calls events are informational; no action needed on voice side
          } else if (currentEvent === 'tool_result') {
            try {
              const payload = JSON.parse(data) as {
                name: string;
                toolCallId: string;
                output: unknown;
              };
              const resultPayload = payload.output as Record<string, unknown> | undefined;
              const panelData =
                resultPayload && typeof resultPayload === 'object' && 'data' in resultPayload
                  ? resultPayload.data
                  : payload.output;

              if (panelData != null) {
                useDataPanelStore.getState().addEntry({
                  toolCallId: payload.toolCallId,
                  toolName: payload.name,
                  title: payload.name.replace(/_/g, ' '),
                  data: panelData,
                });
              }
            } catch (e) {
              logger.warn('[VoiceConversation] Failed to parse tool_result event:', e);
            }
          } else if (currentEvent === 'error') {
            try {
              const parsed = JSON.parse(data) as { error: string };
              throw new Error(parsed.error);
            } catch (e) {
              if (e instanceof Error && e.message !== 'error') throw e;
            }
          }
          currentEvent = 'delta'; // reset for next event
        }
      }
    }
  }, []);

  const startBargeInMonitor = useCallback(() => {
    // Only monitor for voice barge-in if the main window is actively focused!
    if (!document.hasFocus()) {
      logger.debug(
        '[VoiceConversation] Main window is in background. Skipping VAD barge-in monitor.'
      );
      return;
    }

    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.stop();
      bargeInMonitorRef.current = null;
    }

    let stopped = false;
    let micStream: MediaStream | null = null;
    let micAudioCtx: AudioContext | null = null;
    let micProcessor: ScriptProcessorNode | null = null;
    let micSource: MediaStreamAudioSourceNode | null = null;
    let animationFrameId = 0;

    const stateMachine = new BargeInStateMachine();
    const preBuffer = new CircularPCMBuffer({ maxChunks: 12 }); // ~300ms at 25ms/chunk

    const stop = () => {
      stopped = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (micProcessor) {
        try {
          micProcessor.disconnect();
        } catch {
          /* noop */
        }
      }
      if (micSource) {
        try {
          micSource.disconnect();
        } catch {
          /* noop */
        }
      }
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (micAudioCtx) micAudioCtx.close().catch(() => {});
    };

    bargeInMonitorRef.current = { stop };

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStream = stream;
        micAudioCtx = new AudioContext();
        micSource = micAudioCtx.createMediaStreamSource(stream);

        // Use ScriptProcessorNode to capture raw PCM for pre-buffering
        micProcessor = micAudioCtx.createScriptProcessor(4096, 1, 1);
        micSource.connect(micProcessor);
        micProcessor.connect(micAudioCtx.destination);

        // AnalyserNode for volume measurement
        const analyser = micAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        micSource.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Write mic chunks to pre-buffer during TTS playback
        micProcessor.onaudioprocess = (e) => {
          if (stopped) return;
          const isTtsPlaying = audioQueueRef.current && audioQueueRef.current.isPlaying;
          if (isTtsPlaying) {
            preBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          }
        };

        let lastCheck = Date.now();
        const CHECK_INTERVAL = 50; // Higher frequency for responsive two-stage detection

        const checkFrame = () => {
          if (stopped) return;

          const now = Date.now();
          if (now - lastCheck >= CHECK_INTERVAL) {
            lastCheck = now;
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

            const isTtsPlaying = audioQueueRef.current && audioQueueRef.current.isPlaying;

            // Only run state machine when TTS is actively playing
            if (!isTtsPlaying) {
              stateMachine.reset();
              return;
            }

            const action = stateMachine.feed(avg, now);

            if (action === 'duck') {
              // Stage 1: Duck TTS volume
              logger.debug('[VoiceConversation:BargeIn] Stage 1: Ducking TTS volume');
              if (audioQueueRef.current) {
                audioQueueRef.current.setVolume(0.15);
              }
            } else if (action === 'barge-in') {
              // Stage 2: Confirm barge-in — stop TTS and start ASR
              logger.debug('[VoiceConversation:BargeIn] Stage 2: Confirmed! Stopping TTS.');
              stop();
              bargeInRef.current(preBuffer.flush());
              return;
            }
          }

          animationFrameId = requestAnimationFrame(checkFrame);
        };

        checkFrame();
      })
      .catch((err) => {
        console.warn('[VoiceConversation:BargeIn] Failed to start barge-in mic monitor:', err);
      });
  }, []);

  // Monitor window focus/blur to dynamically enable/disable the VAD barge-in microphone capture
  useEffect(() => {
    const handleBlur = () => {
      logger.debug(
        '[VoiceConversation] Main window blurred. Stopping barge-in monitor to prevent loopback.'
      );
      if (bargeInMonitorRef.current) {
        bargeInMonitorRef.current.stop();
        bargeInMonitorRef.current = null;
      }
    };
    const handleFocus = () => {
      if (isActiveRef.current && (state === 'speaking' || state === 'streaming')) {
        logger.debug(
          '[VoiceConversation] Main window focused while AI is responding. Restarting barge-in monitor.'
        );
        startBargeInMonitor();
      }
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [state, startBargeInMonitor]);

  // --- Main conversation flow ---
  const startConversation = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;

      // 1. State Isolation: Block any duplicate triggers if the AI is already streaming or speaking
      if (isActiveRef.current && (state === 'streaming' || state === 'speaking')) {
        console.warn(
          '[VoiceConversation] Conversation already in progress, ignoring duplicate trigger'
        );
        return;
      }

      if (!isActiveRef.current) {
        lastStreamedTextRef.current = '';
        lastUserTextRef.current = '';
        const isFocused = document.hasFocus();
        isAppFocusedRef.current = isFocused;
        setLayoutMode(isFocused ? 'centered' : 'bottom-right');
      }

      // Ensure a conversation exists
      let convId = conversationId;
      if (!convId && createConversation) {
        try {
          const conv = await createConversation();
          convId = conv.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[VoiceConversation] Failed to create conversation:', err);
          setLastError(message);
          setState('error');
          setAssistantText(`无法创建对话: ${message}`);
          isActiveRef.current = false;
          return;
        }
      }

      // 2. Failsafe Cleanup: Force stop and dispose any lingering audio queues or streams before creating new ones
      if (audioQueueRef.current) {
        try {
          audioQueueRef.current.dispose();
        } catch (e) {
          logger.debug('[VoiceConversation] audio queue dispose ignored:', e);
        }
        audioQueueRef.current = null;
      }
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) {
          logger.debug('[VoiceConversation] abort controller abort ignored:', e);
        }
        abortControllerRef.current = null;
      }

      isActiveRef.current = true;
      setState('streaming');
      setAssistantText('');
      setFinalTranscript(userText);
      lastUserTextRef.current = userText;
      setInterimTranscript('');

      const useServerTTS = localStorage.getItem('jarvis_voice_server_tts') === 'true';

      startBargeInMonitor(); // Start background VAD voice barge-in monitor!

      try {
        let fullText = '';

        if (useServerTTS) {
          // ---- Server-side streaming TTS (new path) ----
          const audioCtx = createAudioContext();
          const audioBuffers: AudioBuffer[] = [];
          let nextPlayIndex = 0;
          let currentSource: AudioBufferSourceNode | null = null;
          let speakingStarted = false;
          let playbackCompleteResolve: (() => void) | null = null;

          const tryPlayNext = () => {
            if (!isActiveRef.current) return;
            if (currentSource) return;
            const buffer = audioBuffers[nextPlayIndex];
            if (!buffer) return;
            nextPlayIndex++;

            if (!speakingStarted) {
              speakingStarted = true;
              setState('speaking');
            }

            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            currentSource = source;
            source.onended = () => {
              currentSource = null;
              tryPlayNext();
              if (
                playbackCompleteResolve &&
                audioBuffers.length <= nextPlayIndex &&
                !currentSource
              ) {
                playbackCompleteResolve();
              }
            };
            source.start();
          };

          // Store stop function for barge-in
          const serverTtsQueue = {
            stop: () => {
              if (currentSource) {
                try {
                  currentSource.stop();
                } catch {
                  /* noop */
                }
                currentSource = null;
              }
              audioBuffers.length = 0;
              audioCtx.close().catch(() => {});
            },
            setVolume: () => {},
            getVolume: () => 0,
            dispose: () => {
              if (currentSource) {
                try {
                  currentSource.stop();
                } catch {
                  /* noop */
                }
              }
              audioCtx.close().catch(() => {});
            },
            waitForCompletion: () =>
              new Promise<void>((resolve) => {
                if (audioBuffers.length <= nextPlayIndex && !currentSource) {
                  resolve();
                } else {
                  playbackCompleteResolve = resolve;
                }
              }),
          };
          // Add isPlaying as a getter (matches AudioQueueManager interface)
          Object.defineProperty(serverTtsQueue, 'isPlaying', {
            get: () => currentSource !== null,
          });
          audioQueueRef.current = serverTtsQueue as unknown as AudioQueueManager;

          const abortController = new AbortController();
          abortControllerRef.current = abortController;

          const voice = voiceProfileManager.getVoiceName();
          for await (const event of jarvisClient.converseVoiceStream(
            userText,
            convId ?? undefined,
            {
              voice,
              signal: abortController.signal,
            }
          )) {
            if (!isActiveRef.current) break;

            if (event.type === 'delta') {
              fullText += event.text;
              setAssistantText(fullText);
            } else if (event.type === 'tts_audio') {
              try {
                if (audioCtx.state === 'suspended') {
                  await audioCtx.resume().catch(() => {});
                }
                const decoded = await audioCtx.decodeAudioData(event.audio.slice(0));
                audioBuffers.push(decoded);
                tryPlayNext();
              } catch (err) {
                logger.warn('[VoiceConversation] Failed to decode TTS audio chunk:', err);
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          }

          // Wait for all audio to finish playing
          if (audioBuffers.length > 0) {
            await audioQueueRef.current.waitForCompletion();
          }
        } else {
          // ---- Client-side TTS (existing path) ----
          const queue = new AudioQueueManager(`${daemonUrlRef.current}/api/voice/synthesize`);
          audioQueueRef.current = queue;

          let processedSpokenLength = 0;
          let ttsBuffer = '';
          let sentenceIndex = 0;

          for await (const token of streamLLMResponse(userText, convId)) {
            if (!isActiveRef.current) break;

            fullText += token;
            setAssistantText(fullText);

            const spokenText = getSpokenText(fullText);
            if (spokenText.length > processedSpokenLength) {
              const newSpokenChars = spokenText.slice(processedSpokenLength);
              ttsBuffer += newSpokenChars;
              processedSpokenLength = spokenText.length;
            }

            const { complete, remainder } = splitSentences(ttsBuffer, sentenceIndex);
            for (const sentence of complete) {
              queue.enqueue(sentence, sentenceIndex++);
            }
            ttsBuffer = remainder;
          }

          if (ttsBuffer.trim() && isActiveRef.current) {
            queue.enqueue(ttsBuffer.trim(), sentenceIndex++);
          }

          queue.setTotalExpected(sentenceIndex);

          if (sentenceIndex > 0) {
            setState('speaking');
            await queue.waitForCompletion();
          }
        }

        // Done — breathing delay then post-conversation listen
        if (isActiveRef.current) {
          lastStreamedTextRef.current = fullText;
          logger.debug('[VoiceConversation] Audio done, waiting 800ms breathing delay...');

          await new Promise<void>((resolve) => {
            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }
            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              resolve();
            }, 800);
          });

          if (isActiveRef.current) {
            logger.debug(
              '[VoiceConversation] Breathing pause done, starting post-conversation listen...'
            );
            isActiveRef.current = false;
            startPostConversationListen();
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[VoiceConversation] Error:', error);
          setLastError(message);
          setState('error');
          setTimeout(() => {
            if (isActiveRef.current) setState('idle');
          }, 2000);
        }
      } finally {
        cleanupStreaming();
      }
    },
    [streamLLMResponse, cleanupStreaming, conversationId, createConversation]
  );

  // Keep ref in sync for post-conversation listen
  startConversationRef.current = startConversation;

  // --- Start listening (Web Speech API or batch fallback) ---
  const startListening = useCallback(
    (keepAssistantText = false, force = false) => {
      if (isActiveRef.current && !force) return;

      const voiceMode = localStorage.getItem('jarvis_voice_mode') || 'pipeline';
      if (voiceMode === 'realtime') {
        isActiveRef.current = true;
        connectRealtimeSession();
        return;
      }

      lastStreamedTextRef.current = '';
      if (!keepAssistantText) {
        lastUserTextRef.current = '';
      }

      const isFocused = document.hasFocus();
      isAppFocusedRef.current = isFocused;
      setLayoutMode(isFocused ? 'centered' : 'bottom-right');

      isActiveRef.current = true;
      setState('listening');
      setInterimTranscript('');
      setFinalTranscript('');
      if (!keepAssistantText) {
        setAssistantText('');
      }

      // Safety timeout: if ASR never produces a result, recover to idle
      if (listeningSafetyTimerRef.current) {
        clearTimeout(listeningSafetyTimerRef.current);
      }
      listeningSafetyTimerRef.current = setTimeout(() => {
        if (!isActiveRef.current) return;
        console.warn('[VoiceConversation] Listening safety timeout — ASR may have failed to start');
        if (webAsrRef.current) {
          webAsrRef.current.stop();
        }
        isActiveRef.current = false;
        listeningSafetyTimerRef.current = null;
        setState('idle');
      }, 5000);

      if (isWebSpeechASRAvailable()) {
        let latestInterimText = '';
        accumulatedFinalTextRef.current = '';

        const asr = getOrCreateASR({
          lang: 'zh-CN',
          onInterim: (text: string) => {
            if (listeningSafetyTimerRef.current) {
              clearTimeout(listeningSafetyTimerRef.current);
              listeningSafetyTimerRef.current = null;
            }
            setInterimTranscript(text);
            latestInterimText = text;
          },
          onFinal: (text: string) => {
            if (listeningSafetyTimerRef.current) {
              clearTimeout(listeningSafetyTimerRef.current);
              listeningSafetyTimerRef.current = null;
            }
            accumulatedFinalTextRef.current += text;
            setFinalTranscript(accumulatedFinalTextRef.current);
            setInterimTranscript('');
            latestInterimText = '';
          },
          onError: (err: string) => {
            console.warn('[VoiceConversation] ASR error:', err);
          },
          onEnd: () => {
            logger.debug('[VoiceConversation] ASR onEnd called');
            if (listeningSafetyTimerRef.current) {
              clearTimeout(listeningSafetyTimerRef.current);
              listeningSafetyTimerRef.current = null;
            }

            const textToSubmit = (accumulatedFinalTextRef.current + latestInterimText).trim();
            logger.debug('[VoiceConversation] ASR finished. Text to submit:', textToSubmit);

            isActiveRef.current = false;
            if (textToSubmit) {
              startConversation(textToSubmit);
            } else {
              playFarewellAndExitRef.current();
            }
          },
          silenceTimeout: 4000,
        });
        asr.start();
      } else {
        // Batch ASR fallback
        setState('transcribing');
        transcribeWithWhisper().then((text) => {
          if (!isActiveRef.current) return;
          if (text) {
            startConversation(text);
          } else {
            isActiveRef.current = false;
            playFarewellAndExitRef.current();
          }
        });
      }
    },
    [transcribeWithWhisper, startConversation, connectRealtimeSession]
  );

  // --- Play Sci-Fi greeting and then start listening ---
  const playGreetingAndListen = useCallback(async () => {
    if (isActiveRef.current) return;

    const voiceMode = localStorage.getItem('jarvis_voice_mode') || 'pipeline';
    if (voiceMode === 'realtime') {
      isActiveRef.current = true;
      connectRealtimeSession();
      return;
    }

    lastStreamedTextRef.current = '';
    lastUserTextRef.current = '';

    const isFocused = document.hasFocus();
    isAppFocusedRef.current = isFocused;
    setLayoutMode(isFocused ? 'centered' : 'bottom-right');

    isActiveRef.current = true;
    setState('speaking');
    setAssistantText('我在的，主人。');

    try {
      // 1. Play chime sound
      playSciFiChime();

      // 2. Fetch spoken response
      const buffer = await jarvisClient.synthesize(
        '我在的，主人。',
        voiceProfileManager.getVoiceName()
      );
      if (!isActiveRef.current) {
        logger.debug(
          '[VoiceConversation] Greeting fetch completed but conversation was already stopped. Aborting playback.'
        );
        return;
      }
      const ctx = createAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      greetingAudioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.connect(ctx.destination);
      localSpeakingAnalyserRef.current = analyser;

      ctx.decodeAudioData(
        buffer,
        (decoded) => {
          if (!isActiveRef.current) {
            ctx.close().catch(() => {});
            localSpeakingAnalyserRef.current = null;
            return;
          }
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(analyser); // Connect to analyser
          greetingSourceRef.current = source;

          source.onended = () => {
            greetingSourceRef.current = null;
            localSpeakingAnalyserRef.current = null;
            if (greetingAudioCtxRef.current === ctx) {
              greetingAudioCtxRef.current = null;
            }
            ctx.close().catch(() => {});

            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }

            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              if (isActiveRef.current) {
                isActiveRef.current = false;
                startListening();
              }
            }, 800);
          };

          source.start(0);
        },
        () => {
          if (isActiveRef.current) {
            isActiveRef.current = false;
            startListening();
          }
          ctx.close().catch(() => {});
        }
      );
    } catch (err) {
      console.warn(
        '[VoiceConversation] Greeting playback failed, falling back to direct listening:',
        err
      );
      isActiveRef.current = false;
      startListening();
    }
  }, [startListening, connectRealtimeSession]);

  // --- Stop / Barge-in ---
  const stopConversation = useCallback(() => {
    isActiveRef.current = false;
    cleanup();
    isFarewellPlayingRef.current = false;
    lastStreamedTextRef.current = '';
    setState('idle');
    setInterimTranscript('');
    setFinalTranscript('');
    accumulatedFinalTextRef.current = '';
    setAssistantText('');
    setLastError(null);
  }, [cleanup]);

  const bargeIn = useCallback(
    (preBufferedAudio?: Float32Array[]) => {
      isFarewellPlayingRef.current = false;

      // Save current assistant text for false-positive recovery
      savedAssistantTextForResumeRef.current = assistantText;

      // Clear any existing false-positive timer
      if (falsePositiveTimerRef.current) {
        clearTimeout(falsePositiveTimerRef.current);
        falsePositiveTimerRef.current = null;
      }

      // Stop TTS playback and abort LLM stream
      if (audioQueueRef.current) {
        audioQueueRef.current.stop();
        audioQueueRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Log pre-buffer info
      if (preBufferedAudio && preBufferedAudio.length > 0) {
        logger.debug(
          `[VoiceConversation:BargeIn] Pre-buffered ${preBufferedAudio.length} PCM chunks for ASR`
        );
      }

      // Go back to listening
      isActiveRef.current = true;
      setState('listening');
      setAssistantText('');
      setInterimTranscript('');
      setFinalTranscript('');

      if (isWebSpeechASRAvailable()) {
        let latestInterimText = '';
        accumulatedFinalTextRef.current = '';
        let speechDetected = false;

        const asr = getOrCreateASR({
          lang: 'zh-CN',
          onInterim: (text: string) => {
            if (!speechDetected && text.trim()) {
              speechDetected = true;
              // Clear false-positive timer once speech is detected
              if (falsePositiveTimerRef.current) {
                clearTimeout(falsePositiveTimerRef.current);
                falsePositiveTimerRef.current = null;
              }
            }
            setInterimTranscript(text);
            latestInterimText = text;
          },
          onFinal: (text: string) => {
            if (!speechDetected && text.trim()) {
              speechDetected = true;
              if (falsePositiveTimerRef.current) {
                clearTimeout(falsePositiveTimerRef.current);
                falsePositiveTimerRef.current = null;
              }
            }
            accumulatedFinalTextRef.current += text;
            setFinalTranscript(accumulatedFinalTextRef.current);
            setInterimTranscript('');
            latestInterimText = '';
          },
          onEnd: () => {
            logger.debug('[VoiceConversation:BargeIn] ASR onEnd called');
            const textToSubmit = (accumulatedFinalTextRef.current + latestInterimText).trim();
            logger.debug('[VoiceConversation:BargeIn] Text to submit:', textToSubmit);

            // Clear false-positive timer
            if (falsePositiveTimerRef.current) {
              clearTimeout(falsePositiveTimerRef.current);
              falsePositiveTimerRef.current = null;
            }

            isActiveRef.current = false;
            if (textToSubmit) {
              savedAssistantTextForResumeRef.current = '';
              startConversation(textToSubmit);
            } else {
              playFarewellAndExitRef.current();
            }
          },
          silenceTimeout: 4000,
        });
        asr.start();

        // False-positive recovery: if no speech detected in 3.5s, resume TTS
        falsePositiveTimerRef.current = setTimeout(() => {
          falsePositiveTimerRef.current = null;
          if (!speechDetected && isActiveRef.current) {
            const savedText = savedAssistantTextForResumeRef.current;
            if (savedText) {
              logger.debug(
                '[VoiceConversation:BargeIn] False-positive: no speech in 3.5s, resuming TTS'
              );
              // Stop ASR
              if (webAsrRef.current) {
                webAsrRef.current.stop();
              }
              isActiveRef.current = false;
              savedAssistantTextForResumeRef.current = '';
              // Re-speak the saved text
              startConversation(savedText);
            }
          }
        }, 3500);
      }
    },
    [startConversation, getOrCreateASR, assistantText]
  );

  const finishListening = useCallback(() => {
    if (state !== 'listening') return;
    logger.debug(
      '[VoiceConversation] finishListening called, stopping ASR and submitting current transcripts...'
    );

    const textToSubmit = (accumulatedFinalTextRef.current + interimTranscript).trim();

    if (webAsrRef.current) {
      webAsrRef.current.stop();
    }
    if (listeningSafetyTimerRef.current) {
      clearTimeout(listeningSafetyTimerRef.current);
      listeningSafetyTimerRef.current = null;
    }
    if (postListenTimerRef.current) {
      clearTimeout(postListenTimerRef.current);
      postListenTimerRef.current = null;
    }

    isActiveRef.current = false;

    if (textToSubmit) {
      startConversation(textToSubmit);
    } else {
      playFarewellAndExitRef.current();
    }
  }, [state, interimTranscript, startConversation]);

  const handleWindowBlur = useCallback(() => {
    logger.debug('[VoiceConversation] handleWindowBlur called. Stopping physical WebSpeech ASR...');
    if (webAsrRef.current) {
      webAsrRef.current.stop();
    }
  }, []);

  const handleWindowFocus = useCallback(() => {
    logger.debug(
      '[VoiceConversation] handleWindowFocus called. Resuming physical WebSpeech ASR if state is listening...'
    );
    if (state === 'listening') {
      startListening(true, true);
    }
  }, [state, startListening]);

  const playFarewellAndExit = useCallback(async () => {
    logger.debug('[VoiceConversation] Silence detected, playing farewell and exiting...');
    cleanup();

    isActiveRef.current = true;
    setState('speaking');
    setAssistantText('如果没啥事我就先退下咯，如果有需要随时喊我哦！');
    isFarewellPlayingRef.current = true;

    try {
      const buffer = await jarvisClient.synthesize(
        '如果没啥事我就先退下咯，如果有需要随时喊我哦！',
        voiceProfileManager.getVoiceName()
      );
      const ctx = createAudioContext();

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.connect(ctx.destination);
      localSpeakingAnalyserRef.current = analyser;

      ctx.decodeAudioData(
        buffer,
        (decoded) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(analyser); // Connect to analyser

          source.onended = () => {
            localSpeakingAnalyserRef.current = null;
            ctx.close().catch(() => {});

            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }

            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              if (isActiveRef.current) {
                isActiveRef.current = false;
                setState('idle');
                setAssistantText('');
              }
            }, 800);
          };

          source.start(0);
        },
        () => {
          localSpeakingAnalyserRef.current = null;
          ctx.close().catch(() => {});
          isActiveRef.current = false;
          setState('idle');
          setAssistantText('');
        }
      );
    } catch (err) {
      console.warn('[VoiceConversation] Farewell playback failed:', err);
      isActiveRef.current = false;
      setState('idle');
      setAssistantText('');
    }
  }, [cleanup]);

  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  useEffect(() => {
    playFarewellAndExitRef.current = playFarewellAndExit;
  }, [playFarewellAndExit]);

  // High-performance real-time volume tracker & emitter (bypasses React state to keep App rendering at 0% CPU)
  useEffect(() => {
    let active = true;
    let animationId = 0;
    let micStream: MediaStream | null = null;
    let micAudioCtx: AudioContext | null = null;
    let micAnalyser: AnalyserNode | null = null;
    let micDataArray: Uint8Array<ArrayBuffer> | null = null;
    let emitFn: ((event: string, payload: any) => Promise<void>) | null = null;

    const initEvent = async () => {
      try {
        const { emit } = await import('@tauri-apps/api/event');
        emitFn = emit;
      } catch (e) {
        logger.debug('[VoiceConversation] event init ignored:', e);
      }
    };
    initEvent();

    const runVolumeLoop = () => {
      if (!active) return;

      let vol = 0;
      if (state === 'speaking') {
        if (audioQueueRef.current && audioQueueRef.current.isPlaying) {
          vol = audioQueueRef.current.getVolume();
        } else if (localSpeakingAnalyserRef.current) {
          const dataArray = new Uint8Array(localSpeakingAnalyserRef.current.frequencyBinCount);
          localSpeakingAnalyserRef.current.getByteFrequencyData(dataArray);
          vol = dataArray.reduce((a: number, b: number) => a + b, 0) / dataArray.length;
        }
      } else if (state === 'listening' && micAnalyser && micDataArray) {
        micAnalyser.getByteFrequencyData(micDataArray);
        vol = micDataArray.reduce((a: number, b: number) => a + b, 0) / micDataArray.length;
      }

      if (emitFn) {
        emitFn('voice-volume-tick', { volume: vol }).catch(() => {});
      }

      animationId = requestAnimationFrame(runVolumeLoop);
    };

    if (state === 'speaking') {
      runVolumeLoop();
    } else if (state === 'listening') {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            if (!active) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            micStream = stream;
            micAudioCtx = createAudioContext();
            const source = micAudioCtx.createMediaStreamSource(stream);
            micAnalyser = micAudioCtx.createAnalyser();
            micAnalyser.fftSize = 32;
            source.connect(micAnalyser);
            micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);

            runVolumeLoop();
          })
          .catch((err) => {
            console.warn('[VoiceConversation] Failed to start mic volume tracker:', err);
            runVolumeLoop();
          });
      } else {
        runVolumeLoop();
      }
    }

    return () => {
      active = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
      }
      if (micAudioCtx) {
        micAudioCtx.close().catch(() => {});
      }
      // Emit a final 0 tick to reset visualizers
      if (emitFn) {
        emitFn('voice-volume-tick', { volume: 0 }).catch(() => {});
      }
    };
  }, [state]);

  // Cleanup on unmount

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanup();
      restoreWindow();
    };
  }, [cleanup, restoreWindow]);

  // Restore a specific state (e.g. from the closing assistant bubble)
  const restoreState = useCallback(
    (newState: VoiceConversationState, interim: string, final: string, assistant: string) => {
      logger.debug('[VoiceConversation] restoreState called with:', {
        newState,
        interim,
        final,
        assistant,
      });

      cleanup();

      isActiveRef.current = newState !== 'idle' && newState !== 'error';
      setState(newState);
      setInterimTranscript(interim);
      setFinalTranscript(final);
      setAssistantText(assistant);

      // If the restored state is listening, start physical microphone capture
      if (newState === 'listening') {
        isActiveRef.current = false; // startListening will set it back to true
        startListening(true);
      }
    },
    [cleanup, startListening]
  );

  // Clear persisted text when new messages arrive from server
  const clearLastStreamedText = useCallback(() => {
    lastStreamedTextRef.current = '';
    lastUserTextRef.current = '';
  }, []);

  // Display logic: show live text during streaming, keep ref text after
  const displayAssistantText =
    state === 'streaming' || state === 'speaking'
      ? getSpokenText(assistantText)
      : getSpokenText(lastStreamedTextRef.current || '');

  const displayUserText =
    state === 'streaming' || state === 'speaking' || state === 'listening'
      ? finalTranscript
      : lastUserTextRef.current || '';

  return {
    state,
    interimTranscript,
    finalTranscript: displayUserText,
    assistantText: displayAssistantText,
    thinkingText: '',
    lastError,
    isSupported,
    isConnected: true,
    startListening,
    playGreetingAndListen,
    stopConversation,
    bargeIn,
    finishListening,
    handleWindowBlur,
    handleWindowFocus,
    startConversation,
    clearLastStreamedText,
    layoutMode,
    restoreState,
  };
}
