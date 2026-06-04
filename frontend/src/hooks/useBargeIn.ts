import { useState, useCallback, useRef, useEffect } from 'react';
import { BargeInStateMachine } from '@/lib/bargeInStateMachine';
import { CircularPCMBuffer } from '@/lib/circularPCMBuffer';
import { logger } from '@/lib/logger';
import type { AudioQueueManager } from '@/lib/audioQueue';

export interface UseBargeInReturn {
  isMonitoring: boolean;
  start: (audioQueue: AudioQueueManager) => void;
  stop: () => void;
}

export function useBargeIn(
  onBargeIn: (preBufferedAudio: Float32Array[]) => void
): UseBargeInReturn {
  const [isMonitoring, setIsMonitoring] = useState(false);

  const monitorRef = useRef<{ stop: () => void } | null>(null);
  const onBargeInRef = useRef(onBargeIn);
  const isMonitoringRef = useRef(false);

  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

  const start = useCallback((audioQueue: AudioQueueManager) => {
    // Only monitor for voice barge-in if the main window is actively focused
    if (!document.hasFocus()) {
      logger.debug('[useBargeIn] Main window is in background. Skipping VAD barge-in monitor.');
      return;
    }

    // Stop any existing monitor
    if (monitorRef.current) {
      monitorRef.current.stop();
      monitorRef.current = null;
    }

    let stopped = false;
    let micStream: MediaStream | null = null;
    let micAudioCtx: AudioContext | null = null;
    let micProcessor: ScriptProcessorNode | null = null;
    let micSource: MediaStreamAudioSourceNode | null = null;
    let animationFrameId = 0;

    const stateMachine = new BargeInStateMachine();
    const preBuffer = new CircularPCMBuffer(); // ~500ms at 25ms/chunk (default)

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
      isMonitoringRef.current = false;
      setIsMonitoring(false);
    };

    monitorRef.current = { stop };
    isMonitoringRef.current = true;
    setIsMonitoring(true);

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
          const isTtsPlaying = audioQueue && audioQueue.isPlaying;
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

            const isTtsPlaying = audioQueue && audioQueue.isPlaying;

            // Only run state machine when TTS is actively playing
            if (!isTtsPlaying) {
              stateMachine.reset();
              return;
            }

            const action = stateMachine.feed(avg, now);

            if (action === 'duck') {
              // Stage 1: Duck TTS volume to 50%
              logger.debug('[useBargeIn] Stage 1: Ducking TTS volume to 50%');
              if (audioQueue) {
                audioQueue.setVolume(0.5);
              }
            } else if (action === 'barge-in') {
              // Stage 2: Confirm barge-in — stop TTS, send pre-buffer to ASR
              logger.debug('[useBargeIn] Stage 2: Confirmed! Stopping TTS.');
              stop();
              onBargeInRef.current(preBuffer.flush());
              return;
            } else if (action === 'restore') {
              // Decay detected: voice stopped, restore TTS volume
              logger.debug('[useBargeIn] Decay detected: restoring TTS volume');
              if (audioQueue) {
                audioQueue.setVolume(1.0);
              }
            }
          }

          animationFrameId = requestAnimationFrame(checkFrame);
        };

        checkFrame();
      })
      .catch((err) => {
        console.warn('[useBargeIn] Failed to start barge-in mic monitor:', err);
        isMonitoringRef.current = false;
        setIsMonitoring(false);
      });
  }, []);

  const stopMonitor = useCallback(() => {
    if (monitorRef.current) {
      monitorRef.current.stop();
      monitorRef.current = null;
    }
  }, []);

  // Monitor window focus/blur
  useEffect(() => {
    const handleBlur = () => {
      logger.debug('[useBargeIn] Main window blurred. Stopping barge-in monitor.');
      stopMonitor();
    };
    const handleFocus = () => {
      // Note: caller should restart via start() if needed
      logger.debug('[useBargeIn] Main window focused.');
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [stopMonitor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (monitorRef.current) {
        monitorRef.current.stop();
        monitorRef.current = null;
      }
    };
  }, []);

  return {
    isMonitoring,
    start,
    stop: stopMonitor,
  };
}
