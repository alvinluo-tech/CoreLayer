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
}

export function isWebSpeechASRAvailable(): boolean {
  return getSpeechRecognition() !== null;
}

export function createWebSpeechASR(options: WebSpeechASROptions): WebSpeechASR {
  const {
    lang = "zh-CN",
    onInterim,
    onFinal,
    onError,
    onEnd,
    silenceTimeout = 2500,
  } = options;

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
        onEnd?.();
      }
    }, silenceTimeout);
  };

  recognition.onstart = () => {
    active = true;
    resetSilenceTimer();
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    if (!active) return;
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
      onInterim?.(interimText);
    }
    if (finalText) {
      onFinal?.(finalText);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    console.warn("[WebSpeechASR] Error:", event.error);
    onError?.(event.error);
  };

  recognition.onend = () => {
    clearSilenceTimer();
    if (active) {
      // Auto-restart if still active (browser may stop unexpectedly)
      try {
        recognition.start();
      } catch {
        active = false;
        onEnd?.();
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
    }
  };

  const stop = () => {
    active = false;
    clearSilenceTimer();
    try {
      recognition.abort();
    } catch {}
  };

  return {
    start,
    stop,
    get isActive() {
      return active;
    },
  };
}
