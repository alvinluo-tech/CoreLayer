import { useState, useCallback, useRef, useEffect } from 'react';
import {
  createWebSpeechASR,
  isWebSpeechASRAvailable,
  type WebSpeechASR,
  type WebSpeechASROptions,
} from '@/lib/webSpeechASR';
import { startAudioCapture, encodeWav } from '@/lib/audioCapture';
import { jarvisClient } from '@/lib/jarvisClient';
import { HALLUCINATION_PATTERNS } from '@/lib/voiceUtils';
import { logger } from '@/lib/logger';

export interface UseASROptions {
  lang?: string;
  silenceTimeout?: number;
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: (text: string) => void;
}

export interface UseASRReturn {
  interimTranscript: string;
  finalTranscript: string;
  isListening: boolean;
  error: string | null;
  start: (options?: Partial<UseASROptions>) => void;
  stop: () => string;
  /** Batch Whisper fallback for environments without Web Speech API */
  transcribeWithWhisper: () => Promise<string>;
  activeMicAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
}

export function useASR(defaultOptions?: UseASROptions): UseASRReturn {
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webAsrRef = useRef<WebSpeechASR | null>(null);
  const accumulatedFinalTextRef = useRef('');
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestInterimTextRef = useRef('');
  const isListeningRef = useRef(false);
  const optionsRef = useRef(defaultOptions);
  const activeMicAnalyserRef = useRef<AnalyserNode | null>(null);

  // Keep options ref in sync
  useEffect(() => {
    optionsRef.current = defaultOptions;
  }, [defaultOptions]);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const getOrCreateASR = useCallback((overrides: Partial<WebSpeechASROptions>) => {
    if (!webAsrRef.current) {
      if (isWebSpeechASRAvailable()) {
        webAsrRef.current = createWebSpeechASR({
          lang: 'zh-CN',
          ...overrides,
        });
      }
    } else {
      webAsrRef.current.updateOptions(overrides);
    }
    return webAsrRef.current!;
  }, []);

  const start = useCallback(
    (overrides?: Partial<UseASROptions>) => {
      const opts = { ...optionsRef.current, ...overrides };

      if (!isWebSpeechASRAvailable()) {
        setError('Web Speech API not available');
        opts.onError?.('Web Speech API not available');
        // Attempt Whisper fallback asynchronously
        transcribeWithWhisper()
          .then((text) => {
            if (text) {
              setError(null);
              opts.onEnd?.(text);
            } else {
              opts.onEnd?.('');
            }
          })
          .catch(() => {
            opts.onEnd?.('');
          });
        return;
      }

      setError(null);
      setInterimTranscript('');
      setFinalTranscript('');
      accumulatedFinalTextRef.current = '';
      latestInterimTextRef.current = '';
      isListeningRef.current = true;
      setIsListening(true);

      const asr = getOrCreateASR({
        lang: opts.lang ?? 'zh-CN',
        silenceTimeout: opts.silenceTimeout ?? 4000,
        onInterim: (text: string) => {
          clearSafetyTimer();
          setInterimTranscript(text);
          latestInterimTextRef.current = text;
        },
        onFinal: (text: string) => {
          clearSafetyTimer();
          accumulatedFinalTextRef.current += text;
          setFinalTranscript(accumulatedFinalTextRef.current);
          setInterimTranscript('');
          latestInterimTextRef.current = '';
        },
        onError: (err: string) => {
          logger.warn('[useASR] ASR error:', err);
          setError(err);
          opts.onError?.(err);
          // Attempt Whisper fallback on ASR runtime error
          (async () => {
            try {
              const text = await transcribeWithWhisper();
              if (text && isListeningRef.current) {
                setError(null);
                isListeningRef.current = false;
                setIsListening(false);
                opts.onEnd?.(text);
              }
            } catch {
              // Whisper also failed — stay in error state
            }
          })();
        },
        onEnd: () => {
          clearSafetyTimer();
          const text = (accumulatedFinalTextRef.current + latestInterimTextRef.current).trim();
          isListeningRef.current = false;
          setIsListening(false);
          setInterimTranscript('');
          logger.debug('[useASR] ASR ended. Text:', text);
          opts.onEnd?.(text);
        },
      });

      // Safety timeout: if ASR never produces a result, recover
      safetyTimerRef.current = setTimeout(() => {
        if (!isListeningRef.current) return;
        logger.warn('[useASR] Safety timeout — ASR may have failed to start');
        if (webAsrRef.current) {
          webAsrRef.current.stop();
        }
        isListeningRef.current = false;
        setIsListening(false);
        safetyTimerRef.current = null;
        setError('ASR timeout');
        opts.onEnd?.('');
        // Attempt Whisper fallback asynchronously after reporting timeout
        transcribeWithWhisper()
          .then((text) => {
            if (text) {
              opts.onEnd?.(text);
            }
          })
          .catch(() => {});
      }, 5000);

      asr.start();
    },
    [getOrCreateASR, clearSafetyTimer]
  );

  const stop = useCallback((): string => {
    clearSafetyTimer();
    const text = (accumulatedFinalTextRef.current + latestInterimTextRef.current).trim();

    if (webAsrRef.current) {
      webAsrRef.current.stop();
    }

    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    return text;
  }, [clearSafetyTimer]);

  const transcribeWithWhisper = useCallback(async (): Promise<string> => {
    const capture = await startAudioCapture();
    activeMicAnalyserRef.current = capture.analyser;
    const SILENCE_THRESHOLD = 20;
    const SILENCE_DURATION = 2000;
    const MAX_RECORDING = 30000;

    return new Promise<string>((resolve) => {
      let active = true;
      const dataArray = new Uint8Array(capture.analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const recordingStart = Date.now();

      const checkVAD = () => {
        if (!active) {
          activeMicAnalyserRef.current = null;
          capture.stop();
          resolve('');
          return;
        }

        capture.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          activeMicAnalyserRef.current = null;
          capture.stop();
          processAudio();
          return;
        }

        if (Date.now() - recordingStart > MAX_RECORDING) {
          activeMicAnalyserRef.current = null;
          capture.stop();
          processAudio();
          return;
        }

        requestAnimationFrame(checkVAD);
      };

      const processAudio = async () => {
        active = false;
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
          logger.warn('[useASR] transcribeWithWhisper failed:', err);
          resolve('');
        }
      };

      requestAnimationFrame(checkVAD);
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSafetyTimer();
      if (webAsrRef.current) {
        webAsrRef.current.stop();
        webAsrRef.current = null;
      }
    };
  }, [clearSafetyTimer]);

  return {
    interimTranscript,
    finalTranscript,
    isListening,
    error,
    start,
    stop,
    transcribeWithWhisper,
    activeMicAnalyserRef,
  };
}
