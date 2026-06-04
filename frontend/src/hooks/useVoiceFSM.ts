import { useState, useCallback, useRef, useEffect } from 'react';
import { useASR } from './useASR';
import { useTTSPlayback } from './useTTSPlayback';
import { useBargeIn } from './useBargeIn';
import { useConnectionHealth } from './useConnectionHealth';
import { getDaemonUrl } from '@/lib/tauri';
import { splitSentences } from '@/lib/sentenceSplitter';
import { voiceProfileManager } from '@/lib/voiceProfile';
import { logger } from '@/lib/logger';
import { jarvisClient } from '@/lib/jarvisClient';
import { getSpokenText, playSciFiChime } from '@/lib/voiceUtils';
import { useDataPanelStore } from '@/stores/dataPanelStore';
import { createConnectRealtimeSession } from './voiceRealtimeSession';

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'streaming' | 'speaking' | 'error';

export type VoiceEvent =
  | 'WAKE'
  | 'ASR_RESULT'
  | 'LLM_TOKEN'
  | 'TTS_DONE'
  | 'BARGE_IN'
  | 'SILENCE'
  | 'ERROR'
  | 'STOP';

export interface UseVoiceFSMOptions {
  conversationId: string | null;
  onIdle?: () => void;
  createConversation?: () => Promise<{ id: string }>;
}

export function useVoiceFSM(options: UseVoiceFSMOptions) {
  const { conversationId, onIdle, createConversation } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [thinkingText, setThinkingText] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'centered' | 'bottom-right'>('centered');

  const daemonUrlRef = useRef('http://127.0.0.1:3001');
  const isActiveRef = useRef(false);
  const prevStateRef = useRef<VoiceState>('idle');
  const lastStreamedTextRef = useRef('');
  const lastUserTextRef = useRef('');
  const lastFailedUserTextRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const breathingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingAudioCtxRef = useRef<AudioContext | null>(null);
  const greetingSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const localSpeakingAnalyserRef = useRef<AnalyserNode | null>(null);
  const onIdleRef = useRef(onIdle);
  const startConversationRef = useRef<(text: string) => void>(() => {});
  const savedAssistantTextForResumeRef = useRef('');
  const falsePositiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFarewellPlayingRef = useRef(false);
  const playFarewellAndExitRef = useRef<() => void>(() => {});

  // WebRTC refs for realtime mode
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Composed hooks
  const asr = useASR();
  const tts = useTTSPlayback();
  const bargeIn = useBargeIn((preBufferedAudio) => {
    handleBargeIn(preBufferedAudio);
  });
  const connectionHealth = useConnectionHealth();

  // Keep onIdle ref in sync
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // State transition to idle effect
  useEffect(() => {
    if (state === 'idle' && prevStateRef.current !== 'idle') {
      logger.debug(`[VoiceFSM] Transition: ${prevStateRef.current} → idle`);
      connectionHealth.stop();
      onIdleRef.current?.();
    } else if (state !== 'idle' && prevStateRef.current === 'idle') {
      connectionHealth.start();
    }
    prevStateRef.current = state;
  }, [state, connectionHealth]);

  // Initialize daemon URL
  useEffect(() => {
    setIsSupported(true);
    getDaemonUrl()
      .then((url) => {
        daemonUrlRef.current = url;
      })
      .catch(() => {});
  }, []);

  // --- LLM Streaming ---
  const streamLLMResponse = useCallback(async function* (message: string, convId?: string | null) {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const response = await fetch(`${daemonUrlRef.current}/api/voice/converse-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId: convId || undefined }),
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
              yield { type: 'delta' as const, text: payload.text };
            } catch {
              yield { type: 'delta' as const, text: data };
            }
          } else if (currentEvent === 'thinking') {
            try {
              const payload = JSON.parse(data) as { text: string };
              yield { type: 'thinking' as const, text: payload.text };
            } catch {
              // ignore malformed thinking
            }
          } else if (currentEvent === 'tool_calls') {
            // informational
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
              logger.warn('[VoiceFSM] Failed to parse tool_result event:', e);
            }
          } else if (currentEvent === 'error') {
            try {
              const parsed = JSON.parse(data) as { error: string };
              throw new Error(parsed.error);
            } catch (e) {
              if (e instanceof Error && e.message !== 'error') throw e;
            }
          }
          currentEvent = 'delta';
        }
      }
    }
  }, []);

  // --- Start Conversation ---
  const startConversation = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;

      if (isActiveRef.current && (state === 'streaming' || state === 'speaking')) {
        return;
      }

      if (!isActiveRef.current) {
        lastStreamedTextRef.current = '';
        lastUserTextRef.current = '';
        const isFocused = document.hasFocus();
        setLayoutMode(isFocused ? 'centered' : 'bottom-right');
      }

      // Ensure conversation exists
      let convId = conversationId;
      if (!convId && createConversation) {
        try {
          const conv = await createConversation();
          convId = conv.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setLastError(message);
          setState('error');
          setAssistantText(`无法创建对话: ${message}`);
          isActiveRef.current = false;
          return;
        }
      }

      // Cleanup previous state
      tts.dispose();
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {
          // ignore
        }
        abortControllerRef.current = null;
      }

      isActiveRef.current = true;
      setState('streaming');
      setAssistantText('');
      setThinkingText('');
      setFinalTranscript(userText);
      lastUserTextRef.current = userText;
      setInterimTranscript('');

      const queue = tts.createQueue(daemonUrlRef.current);
      bargeIn.start(queue);

      try {
        let fullText = '';
        let processedSpokenLength = 0;
        let ttsBuffer = '';
        let sentenceIndex = 0;

        for await (const event of streamLLMResponse(userText, convId)) {
          if (!isActiveRef.current) break;

          if (event.type === 'thinking') {
            setThinkingText((prev) => prev + event.text);
            continue;
          }

          fullText += event.text;
          setAssistantText(fullText);

          const spokenText = getSpokenText(fullText);
          if (spokenText.length > processedSpokenLength) {
            const newSpokenChars = spokenText.slice(processedSpokenLength);
            ttsBuffer += newSpokenChars;
            processedSpokenLength = spokenText.length;
          }

          const { complete, remainder } = splitSentences(ttsBuffer, sentenceIndex);
          for (const s of complete) {
            tts.enqueue(s, sentenceIndex++);
          }
          ttsBuffer = remainder;
        }

        if (ttsBuffer.trim() && isActiveRef.current) {
          const finalSentences = splitSentences(ttsBuffer.trim(), sentenceIndex);
          if (finalSentences.complete.length > 0) {
            const batchItems = finalSentences.complete.map((s) => {
              const idx = sentenceIndex;
              sentenceIndex++;
              return { text: s, index: idx };
            });
            await tts.enqueueBatch(batchItems);
          }
          if (finalSentences.remainder.trim()) {
            tts.enqueue(finalSentences.remainder.trim(), sentenceIndex++);
          }
        }

        tts.setTotalExpected(sentenceIndex);

        if (sentenceIndex > 0) {
          setState('speaking');
          await tts.waitForCompletion();
        }

        if (isActiveRef.current) {
          lastStreamedTextRef.current = fullText;
          await new Promise<void>((resolve) => {
            if (breathingTimerRef.current) clearTimeout(breathingTimerRef.current);
            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              resolve();
            }, 800);
          });

          if (isActiveRef.current) {
            isActiveRef.current = false;
            startPostConversationListen();
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const message = error instanceof Error ? error.message : String(error);

          // Retry LLM stream failure once
          if (!lastFailedUserTextRef.current) {
            logger.warn('[VoiceFSM] Stream failed, retrying once:', message);
            lastFailedUserTextRef.current = userText;
            isActiveRef.current = false;
            startConversation(userText);
            return;
          }

          lastFailedUserTextRef.current = '';
          setLastError(message);
          setState('error');
          setTimeout(() => {
            if (isActiveRef.current) setState('idle');
          }, 2000);
        }
      } finally {
        bargeIn.stop();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, conversationId, createConversation, tts, bargeIn, streamLLMResponse]
  );

  startConversationRef.current = startConversation;

  // --- Post-conversation listen ---
  const startPostConversationListen = useCallback(() => {
    if (isActiveRef.current) return;

    if (postListenTimerRef.current) {
      clearTimeout(postListenTimerRef.current);
      postListenTimerRef.current = null;
    }

    isActiveRef.current = true;
    setState('listening');
    setInterimTranscript('');
    setFinalTranscript('');

    asr.start({
      silenceTimeout: 5000,
      onEnd: (text) => {
        isActiveRef.current = false;
        if (text) {
          startConversationRef.current(text);
        } else {
          playFarewellAndExitRef.current();
        }
      },
    });
  }, [asr]);

  // --- Connect realtime session ---
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

  // --- Start listening ---
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
      setLayoutMode(isFocused ? 'centered' : 'bottom-right');

      isActiveRef.current = true;
      setState('listening');
      setInterimTranscript('');
      setFinalTranscript('');
      if (!keepAssistantText) {
        setAssistantText('');
      }

      asr.start({
        silenceTimeout: 4000,
        onEnd: (text) => {
          isActiveRef.current = false;
          if (text) {
            startConversation(text);
          } else {
            playFarewellAndExitRef.current();
          }
        },
      });
    },
    [asr, startConversation, connectRealtimeSession]
  );

  // --- Play greeting ---
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
    setLayoutMode(isFocused ? 'centered' : 'bottom-right');

    isActiveRef.current = true;
    setState('speaking');
    setAssistantText('我在的，主人。');

    try {
      playSciFiChime();

      const buffer = await jarvisClient.synthesize(
        '我在的，主人。',
        voiceProfileManager.getVoiceName()
      );
      if (!isActiveRef.current) return;

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
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
            return;
          }
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(analyser);
          greetingSourceRef.current = source;

          source.onended = () => {
            greetingSourceRef.current = null;
            localSpeakingAnalyserRef.current = null;
            if (greetingAudioCtxRef.current === ctx) {
              greetingAudioCtxRef.current = null;
            }
            ctx.close().catch(() => {});

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
      logger.warn('[VoiceFSM] Greeting failed:', err);
      isActiveRef.current = false;
      startListening();
    }
  }, [startListening, connectRealtimeSession]);

  // --- Barge-in handler ---
  const handleBargeIn = useCallback(
    (preBufferedAudio?: Float32Array[]) => {
      isFarewellPlayingRef.current = false;
      savedAssistantTextForResumeRef.current = assistantText;

      if (falsePositiveTimerRef.current) {
        clearTimeout(falsePositiveTimerRef.current);
        falsePositiveTimerRef.current = null;
      }

      tts.stop();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (preBufferedAudio && preBufferedAudio.length > 0) {
        logger.debug(`[VoiceFSM:BargeIn] Pre-buffered ${preBufferedAudio.length} PCM chunks`);
      }

      isActiveRef.current = true;
      setState('listening');
      setAssistantText('');
      setInterimTranscript('');
      setFinalTranscript('');

      const speechDetected = false;

      asr.start({
        silenceTimeout: 4000,
        onEnd: (text) => {
          if (falsePositiveTimerRef.current) {
            clearTimeout(falsePositiveTimerRef.current);
            falsePositiveTimerRef.current = null;
          }

          isActiveRef.current = false;
          if (text) {
            savedAssistantTextForResumeRef.current = '';
            startConversation(text);
          } else {
            playFarewellAndExitRef.current();
          }
        },
      });

      // False-positive recovery
      falsePositiveTimerRef.current = setTimeout(() => {
        falsePositiveTimerRef.current = null;
        if (!speechDetected && isActiveRef.current) {
          const savedText = savedAssistantTextForResumeRef.current;
          if (savedText) {
            logger.debug('[VoiceFSM:BargeIn] False-positive: resuming TTS');
            asr.stop();
            isActiveRef.current = false;
            savedAssistantTextForResumeRef.current = '';
            startConversation(savedText);
          }
        }
      }, 3500);
    },
    [assistantText, asr, tts, startConversation]
  );

  // --- Stop ---
  const stopConversation = useCallback(() => {
    isActiveRef.current = false;
    asr.stop();
    tts.stop();
    bargeIn.stop();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isFarewellPlayingRef.current = false;
    lastStreamedTextRef.current = '';
    setState('idle');
    setInterimTranscript('');
    setFinalTranscript('');
    setAssistantText('');
    setLastError(null);
  }, [asr, tts, bargeIn]);

  // --- Finish listening ---
  const finishListening = useCallback(() => {
    if (state !== 'listening') return;

    const textToSubmit = (asr.finalTranscript + asr.interimTranscript).trim();
    asr.stop();

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
  }, [state, asr, startConversation]);

  // --- Farewell ---
  const playFarewellAndExit = useCallback(async () => {
    logger.debug('[VoiceFSM] Playing farewell and exiting...');
    asr.stop();
    tts.stop();

    isActiveRef.current = true;
    setState('speaking');
    setAssistantText('如果没啥事我就先退下咯，如果有需要随时喊我哦！');
    isFarewellPlayingRef.current = true;

    try {
      const buffer = await jarvisClient.synthesize(
        '如果没啥事我就先退下咯，如果有需要随时喊我哦！',
        voiceProfileManager.getVoiceName()
      );
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();

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
          source.connect(analyser);

          source.onended = () => {
            localSpeakingAnalyserRef.current = null;
            ctx.close().catch(() => {});

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
      logger.warn('[VoiceFSM] Farewell failed:', err);
      isActiveRef.current = false;
      setState('idle');
      setAssistantText('');
    }
  }, [asr, tts]);

  playFarewellAndExitRef.current = playFarewellAndExit;

  // --- Window blur/focus ---
  const handleWindowBlur = useCallback(() => {
    if (asr.isListening) {
      asr.stop();
    }
  }, [asr]);

  const handleWindowFocus = useCallback(() => {
    if (state === 'listening') {
      startListening(true, true);
    }
  }, [state, startListening]);

  // --- Restore state ---
  const restoreState = useCallback(
    (newState: VoiceState, interim: string, final: string, assistant: string) => {
      asr.stop();
      tts.stop();
      bargeIn.stop();

      isActiveRef.current = newState !== 'idle' && newState !== 'error';
      setState(newState);
      setInterimTranscript(interim);
      setFinalTranscript(final);
      setAssistantText(assistant);

      if (newState === 'listening') {
        isActiveRef.current = false;
        startListening(true);
      }
    },
    [asr, tts, bargeIn, startListening]
  );

  const clearLastStreamedText = useCallback(() => {
    lastStreamedTextRef.current = '';
    lastUserTextRef.current = '';
  }, []);

  // --- Manual retry from error state ---
  const retryLastAction = useCallback(() => {
    if (state !== 'error') return;

    const failedText = lastFailedUserTextRef.current || lastUserTextRef.current;
    lastFailedUserTextRef.current = '';
    setLastError(null);

    if (failedText) {
      setState('idle');
      startConversation(failedText);
    } else {
      setState('idle');
    }
  }, [state, startConversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      asr.stop();
      tts.dispose();
      bargeIn.stop();
      if (breathingTimerRef.current) clearTimeout(breathingTimerRef.current);
      if (postListenTimerRef.current) clearTimeout(postListenTimerRef.current);
      if (falsePositiveTimerRef.current) clearTimeout(falsePositiveTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Display logic
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
    thinkingText,
    lastError,
    isSupported,
    isConnected: connectionHealth.isConnected,
    startListening,
    playGreetingAndListen,
    stopConversation,
    bargeIn: handleBargeIn,
    finishListening,
    handleWindowBlur,
    handleWindowFocus,
    startConversation,
    clearLastStreamedText,
    layoutMode,
    restoreState,
    retryLastAction,
  };
}
