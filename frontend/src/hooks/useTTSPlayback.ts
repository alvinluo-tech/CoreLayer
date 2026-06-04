import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioQueueManager } from '@/lib/audioQueue';

export interface UseTTSPlaybackReturn {
  isPlaying: boolean;
  currentSentence: number;
  totalSentences: number;
  /** Create a new AudioQueueManager for a conversation turn */
  createQueue: (daemonUrl: string) => AudioQueueManager;
  /** Enqueue a sentence for synthesis and playback */
  enqueue: (sentence: string, index: number) => void;
  /** Batch-synthesize multiple sentences in a single request */
  enqueueBatch: (sentences: Array<{ text: string; index: number }>) => Promise<void>;
  /** Set total expected sentences (for completion detection) */
  setTotalExpected: (count: number) => void;
  /** Wait for all queued audio to finish playing */
  waitForCompletion: () => Promise<void>;
  /** Stop current playback (for barge-in) */
  stop: () => void;
  /** Set volume (0-1) for barge-in ducking */
  setVolume: (volume: number) => void;
  /** Get current playback volume (0-255) for visualization */
  getVolume: () => number;
  /** Dispose the current queue and clean up resources */
  dispose: () => void;
}

export function useTTSPlayback(): UseTTSPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [totalSentences, setTotalSentences] = useState(0);

  const queueRef = useRef<AudioQueueManager | null>(null);
  const isPlayingRef = useRef(false);

  const createQueue = useCallback((daemonUrl: string) => {
    // Dispose existing queue if any
    if (queueRef.current) {
      try {
        queueRef.current.dispose();
      } catch {
        // ignore
      }
    }

    const queue = new AudioQueueManager(`${daemonUrl}/api/voice/synthesize`);
    queueRef.current = queue;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentSentence(0);
    setTotalSentences(0);

    return queue;
  }, []);

  const enqueue = useCallback((sentence: string, index: number) => {
    if (!queueRef.current) return;
    queueRef.current.enqueue(sentence, index);
    setCurrentSentence(index + 1);
  }, []);

  const enqueueBatch = useCallback(async (sentences: Array<{ text: string; index: number }>) => {
    if (!queueRef.current) return;
    await queueRef.current.enqueueBatch(sentences);
    if (sentences.length > 0) {
      setCurrentSentence(Math.max(...sentences.map((s) => s.index)) + 1);
    }
  }, []);

  const setTotalExpected = useCallback((count: number) => {
    if (!queueRef.current) return;
    queueRef.current.setTotalExpected(count);
    setTotalSentences(count);
  }, []);

  const waitForCompletion = useCallback(async () => {
    if (!queueRef.current) return;
    await queueRef.current.waitForCompletion();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentSentence(0);
  }, []);

  const stop = useCallback(() => {
    if (queueRef.current) {
      queueRef.current.stop();
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (queueRef.current) {
      queueRef.current.setVolume(volume);
    }
  }, []);

  const getVolume = useCallback((): number => {
    if (!queueRef.current || !isPlayingRef.current) return 0;
    return queueRef.current.getVolume();
  }, []);

  const dispose = useCallback(() => {
    if (queueRef.current) {
      try {
        queueRef.current.dispose();
      } catch {
        // ignore
      }
      queueRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentSentence(0);
    setTotalSentences(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (queueRef.current) {
        try {
          queueRef.current.dispose();
        } catch {
          // ignore
        }
        queueRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying,
    currentSentence,
    totalSentences,
    createQueue,
    enqueue,
    enqueueBatch,
    setTotalExpected,
    waitForCompletion,
    stop,
    setVolume,
    getVolume,
    dispose,
  };
}
