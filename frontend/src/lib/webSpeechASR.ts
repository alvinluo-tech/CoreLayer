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
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
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
  onspeechstart: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["webkitSpeechRecognition"] ?? w["SpeechRecognition"]) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

export interface WebSpeechASROptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  silenceTimeout?: number;
}

export interface WebSpeechASR {
  start: () => void;
  stop: () => void;
  readonly isActive: boolean;
  updateOptions: (newOptions: Partial<WebSpeechASROptions>) => void;
}

export function isWebSpeechASRAvailable(): boolean {
  return getSpeechRecognition() !== null;
}

export function createWebSpeechASR(options: WebSpeechASROptions): WebSpeechASR {
  let currentSilenceTimeout = options.silenceTimeout ?? 2500;
  let currentOnInterim = options.onInterim;
  let currentOnFinal = options.onFinal;
  let currentOnError = options.onError;
  let currentOnEnd = options.onEnd;
  const lang = options.lang ?? "zh-CN";

  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    throw new Error("Web Speech API not available");
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  let active = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveRestarts = 0;
  const MAX_RESTARTS = 3; // Give up after 3 consecutive restarts with no audio

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const resetSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (active) {
        stop();
        currentOnEnd?.();
      }
    }, currentSilenceTimeout);
  };

  recognition.onstart = () => {
    active = true;
    resetSilenceTimer();
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    if (!active) return;
    // Reset restart counter when actual audio is received
    consecutiveRestarts = 0;
    resetSilenceTimer();

    let interimText = "";
    let finalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result?.[0]) continue;
      const transcript = result[0].transcript;
      if (result.isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (interimText) {
      currentOnInterim?.(interimText);
    }
    if (finalText) {
      currentOnFinal?.(finalText);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    console.warn("[WebSpeechASR] Error:", event.error);
    currentOnError?.(event.error);

    // Stop recognition and reset active status on critical errors (including audio-capture) to prevent infinite loops in WebView2
    active = false;
    clearSilenceTimer();
    try {
      recognition.abort();
    } catch {}
    currentOnEnd?.();
  };

  recognition.onend = () => {
    clearSilenceTimer();
    if (active) {
      consecutiveRestarts++;
      if (consecutiveRestarts > MAX_RESTARTS) {
        // Too many restarts with no audio — mic is likely locked or unavailable.
        // Give up cleanly to prevent an infinite loop.
        console.warn(`[WebSpeechASR] Giving up after ${MAX_RESTARTS} restarts with no audio (mic locked?).`);
        active = false;
        currentOnEnd?.();
        return;
      }
      // Auto-restart if still active (browser may stop unexpectedly)
      try {
        recognition.start();
      } catch {
        active = false;
        currentOnEnd?.();
      }
    }
  };

  const start = () => {
    if (active) return;
    active = true;
    try {
      recognition.start();
    } catch {
      active = false;
      clearSilenceTimer();
      currentOnEnd?.();
    }
  };

  const stop = () => {
    active = false;
    clearSilenceTimer();
    try {
      recognition.abort();
    } catch {}
  };

  const updateOptions = (newOptions: Partial<WebSpeechASROptions>) => {
    if (newOptions.silenceTimeout !== undefined) currentSilenceTimeout = newOptions.silenceTimeout;
    if (newOptions.onInterim !== undefined) currentOnInterim = newOptions.onInterim;
    if (newOptions.onFinal !== undefined) currentOnFinal = newOptions.onFinal;
    if (newOptions.onError !== undefined) currentOnError = newOptions.onError;
    if (newOptions.onEnd !== undefined) currentOnEnd = newOptions.onEnd;
  };

  return {
    start,
    stop,
    updateOptions,
    get isActive() {
      return active;
    },
  };
}

