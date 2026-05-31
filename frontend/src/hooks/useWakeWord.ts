import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';

// Wake words for Web Speech API fallback
const WAKE_WORDS = [
  'jarvis',
  'jar vis',
  'javis',
  'javs',
  '贾维斯',
  '加维斯',
  '佳维斯',
  '家维斯',
  '甲维斯',
  '嘉维斯',
  '假维斯',
  '查维斯',
  '查理斯',
  '加维',
  '佳斯',
  '维斯',
];

type WakeWordMethod = 'porcupine' | 'webspeech' | null;

// Web Speech API type helpers
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['webkitSpeechRecognition'] ?? w['SpeechRecognition']) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

export function useWakeWord(onWake: () => void, daemonUrl?: string) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<WakeWordMethod>(null);

  const porcupineRef = useRef<{
    unsubscribe: () => Promise<void>;
    release: () => Promise<void>;
  } | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onWakeRef = useRef(onWake);
  const isActiveRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  // --- Porcupine (primary) ---
  const startPorcupine = useCallback(async (accessKey: string): Promise<boolean> => {
    try {
      const { PorcupineWorker, BuiltInKeyword } = await import('@picovoice/porcupine-web');
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');

      const porcupine = await PorcupineWorker.create(
        accessKey,
        BuiltInKeyword.Jarvis,
        (detection) => {
          logger.debug('[WakeWord:Porcupine] Detected:', detection.label);
          onWakeRef.current();
        },
        { publicPath: '' }
      );

      await WebVoiceProcessor.subscribe(porcupine);
      porcupineRef.current = {
        unsubscribe: () => WebVoiceProcessor.unsubscribe(porcupine),
        release: () => porcupine.release(),
      };
      setMethod('porcupine');
      logger.debug("[WakeWord] Porcupine listening for 'Jarvis'");
      return true;
    } catch (err) {
      console.warn('[WakeWord] Porcupine failed:', err);
      return false;
    }
  }, []);

  // --- Web Speech API (fallback) ---
  const startWebSpeech = useCallback((): boolean => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      console.warn('[WakeWord] Web Speech API not available');
      return false;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // High reliability non-continuous restart loop
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';
      recognition.maxAlternatives = 1;

      let wakeTriggered = false;

      recognition.onstart = () => {
        logger.debug('[WakeWord:WebSpeech] Web Speech session active...');
        lastErrorRef.current = null;
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (wakeTriggered) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result?.[0]) continue;
          const transcript = result[0].transcript.toLowerCase();
          logger.debug('[WakeWord:WebSpeech] Heard:', transcript, 'final:', result.isFinal);
          const matched = WAKE_WORDS.some((word) => transcript.includes(word));
          if (matched) {
            wakeTriggered = true;
            logger.debug('[WakeWord:WebSpeech] WAKE WORD DETECTED:', transcript);
            onWakeRef.current();
            break;
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('[WakeWord:WebSpeech] Error:', event.error);
        lastErrorRef.current = event.error;
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setError(event.error);
          setIsListening(false);
          isActiveRef.current = false;
        }
      };

      recognition.onend = () => {
        if (isActiveRef.current) {
          const isCritical =
            lastErrorRef.current &&
            (lastErrorRef.current === 'not-allowed' ||
              lastErrorRef.current === 'audio-capture' ||
              lastErrorRef.current === 'aborted');

          const delay = isCritical ? 2000 : 50; // 50ms restart for normal silence, 2000ms delay for system conflicts/background suspension

          setTimeout(() => {
            if (isActiveRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.warn('[WakeWord:WebSpeech] Keep-alive restart failed:', e);
              }
            }
          }, delay);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setMethod('webspeech');
      logger.debug("[WakeWord] Web Speech API listening for 'Hey Jarvis' or Chinese homophones");
      return true;
    } catch (err) {
      console.warn('[WakeWord] Web Speech API failed:', err);
      return false;
    }
  }, []);

  // --- Public API ---
  const start = useCallback(
    async (accessKey?: string) => {
      if (isActiveRef.current) {
        logger.debug('[WakeWord] Already active, skipping');
        return;
      }
      setError(null);
      logger.debug('[WakeWord] Starting...');

      // Try Porcupine first (accessKey must be provided directly, never fetched from server)
      let key = accessKey;

      if (key) {
        const ok = await startPorcupine(key);
        if (ok) {
          isActiveRef.current = true;
          setIsListening(true);
          return;
        }
      }

      // Fallback to Web Speech API
      logger.debug('[WakeWord] Trying Web Speech API...');
      const ok = startWebSpeech();
      if (ok) {
        isActiveRef.current = true;
        setIsListening(true);
        logger.debug('[WakeWord] Web Speech API started successfully');
      } else {
        console.error('[WakeWord] Both Porcupine and Web Speech API failed');
        setError('无法启动唤醒词检测（Porcupine key 未配置，Web Speech API 不可用）');
      }
    },
    [daemonUrl, startPorcupine, startWebSpeech]
  );

  const stop = useCallback(async () => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;

    if (method === 'porcupine' && porcupineRef.current) {
      try {
        await porcupineRef.current.unsubscribe();
        await porcupineRef.current.release();
      } catch (e) {
        logger.debug('[WakeWord] porcupine cleanup ignored:', e);
      }
      porcupineRef.current = null;
    }

    if (method === 'webspeech' && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        logger.debug('[WakeWord] recognition abort ignored:', e);
      }
      recognitionRef.current = null;
    }

    setMethod(null);
    setIsListening(false);
    logger.debug('[WakeWord] Stopped');
  }, [method]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (porcupineRef.current) {
        porcupineRef.current.unsubscribe().catch(() => {});
        porcupineRef.current.release().catch(() => {});
        porcupineRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Already aborted or not started
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isListening, error, method, start, stop };
}
