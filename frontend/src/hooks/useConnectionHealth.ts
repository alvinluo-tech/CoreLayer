import { useState, useCallback, useRef, useEffect } from 'react';
import { getDaemonUrl } from '@/lib/tauri';
import { logger } from '@/lib/logger';

export interface UseConnectionHealthReturn {
  isConnected: boolean;
  lastCheckTime: number | null;
  start: () => void;
  stop: () => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

export function useConnectionHealth(): UseConnectionHealthReturn {
  const [isConnected, setIsConnected] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const daemonUrlRef = useRef('');

  const checkHealth = useCallback(async () => {
    if (!daemonUrlRef.current) {
      try {
        daemonUrlRef.current = await getDaemonUrl();
      } catch {
        setIsConnected(false);
        return;
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

      const response = await fetch(`${daemonUrlRef.current}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        setIsConnected(true);
        setLastCheckTime(Date.now());
      } else {
        logger.warn('[ConnectionHealth] Health check failed:', response.status);
        setIsConnected(false);
        setLastCheckTime(Date.now());
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        logger.warn('[ConnectionHealth] Health check error:', err);
      }
      setIsConnected(false);
      setLastCheckTime(Date.now());
    }
  }, []);

  const start = useCallback(() => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;

    // Immediate check
    checkHealth();

    // Periodic check
    intervalRef.current = setInterval(() => {
      if (isActiveRef.current) {
        checkHealth();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [checkHealth]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    lastCheckTime,
    start,
    stop,
  };
}
