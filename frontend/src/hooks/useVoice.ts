import { useState, useCallback, useRef, useEffect } from "react";

const DAEMON_URL = "http://localhost:3001";

export type VoiceState = "idle" | "recording" | "transcribing" | "processing" | "speaking";

export function useVoice(onCommand: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  // ---- Barge-in: stop TTS when user starts speaking ----
  const stopTTS = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      sourceNodeRef.current = null;
    }
  }, []);

  // ---- TTS: call daemon MiMo TTS API and play audio ----
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any ongoing speech (barge-in)
    stopTTS();
    setState("speaking");

    try {
      const response = await fetch(`${DAEMON_URL}/api/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: "mimo-v2.5-tts" }),
      });

      if (!response.ok) {
        // Fallback to browser TTS if MiMo TTS fails
        speakWithBrowserTTS(text);
        return;
      }

      const audioBuffer = await response.arrayBuffer();
      await playAudioBuffer(audioBuffer);

      // After speaking, go back to idle
      if (isRecordingRef.current) {
        startRecording();
      } else {
        setState("idle");
      }
    } catch {
      // Fallback to browser TTS
      speakWithBrowserTTS(text);
    }
  }, [stopTTS]);

  // Play audio buffer using Web Audio API (supports barge-in)
  const playAudioBuffer = useCallback(async (buffer: ArrayBuffer): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      ctx.decodeAudioData(buffer, (decoded) => {
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        sourceNodeRef.current = source;

        source.onended = () => {
          sourceNodeRef.current = null;
          resolve();
        };

        source.start();
      }, () => {
        // Decode failed, resolve anyway
        resolve();
      });
    });
  }, []);

  // Browser TTS fallback
  const speakWithBrowserTTS = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      setState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find((v) => v.lang.startsWith("zh"));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onend = () => {
      if (isRecordingRef.current) {
        startRecording();
      } else {
        setState("idle");
      }
    };
    utterance.onerror = () => setState("idle");

    window.speechSynthesis.speak(utterance);
  }, []);

  // ---- ASR: record audio and send to Groq Whisper via daemon ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analyser for VAD (voice activity detection)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];

        if (blob.size < 1000) {
          // Too small, probably silence
          if (isRecordingRef.current) {
            startRecording();
          } else {
            setState("idle");
          }
          return;
        }

        setState("transcribing");
        const text = await transcribeAudio(blob);

        if (text && text.trim()) {
          setTranscript(text);
          setState("processing");
          onCommandRef.current(text.trim());
        } else {
          if (isRecordingRef.current) {
            startRecording();
          } else {
            setState("idle");
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      isRecordingRef.current = true;
      setState("recording");

      // Simple VAD: stop recording after silence
      startSilenceDetection(analyser, mediaRecorder);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setState("idle");
    }
  }, []);

  // Simple silence detection using audio analyser
  const startSilenceDetection = useCallback((analyser: AnalyserNode, recorder: MediaRecorder) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceStart = 0;
    const SILENCE_THRESHOLD = 15; // volume threshold
    const SILENCE_DURATION = 1500; // ms of silence before stopping
    const MIN_SPEECH_DURATION = 500; // minimum recording duration
    let speechStarted = false;
    let recordingStart = Date.now();

    const check = () => {
      if (!isRecordingRef.current || recorder.state !== "recording") return;

      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > SILENCE_THRESHOLD) {
        speechStarted = true;
        silenceStart = 0;
      } else if (speechStarted) {
        if (silenceStart === 0) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          // Silence long enough, stop recording
          if (Date.now() - recordingStart > MIN_SPEECH_DURATION) {
            recorder.stop();
            return;
          }
        }
      } else if (!speechStarted && Date.now() - recordingStart > 10000) {
        // No speech detected for 10 seconds, stop
        recorder.stop();
        return;
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }, []);

  // Send audio to daemon for transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("language", "zh");

      const response = await fetch(`${DAEMON_URL}/api/voice/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        console.error("Transcription failed:", response.status);
        return "";
      }

      const data = (await response.json()) as { text: string };
      return data.text;
    } catch (err) {
      console.error("Transcription error:", err);
      return "";
    }
  }, []);

  // ---- Control ----
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    stopRecording();
    stopTTS();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setState("idle");
    setTranscript("");
  }, [stopRecording, stopTTS]);

  const toggleListening = useCallback(() => {
    if (isRecordingRef.current || state === "speaking") {
      stopListening();
    } else {
      startRecording();
    }
  }, [state, startRecording, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch {}
      }
    };
  }, []);

  return {
    state,
    transcript,
    isSupported,
    isListening: isRecordingRef.current,
    startListening: startRecording,
    stopListening,
    toggleListening,
    speak,
    stopTTS,
  };
}
