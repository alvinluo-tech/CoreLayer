import { useState, useCallback, useRef, useEffect } from "react";
import { getDaemonUrl } from "@/lib/tauri";

export type VoiceState = "idle" | "recording" | "transcribing" | "processing" | "speaking";

export function useVoice(onCommand: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isRecordingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const streamRef = useRef<MediaStream | null>(null);
  const daemonUrlRef = useRef<string>("http://localhost:3001");

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Discover daemon URL from Tauri backend on mount
  useEffect(() => {
    setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia));
    getDaemonUrl()
      .then((url) => {
        daemonUrlRef.current = url;
        console.log("[Voice] Daemon URL:", url);
      })
      .catch(() => {
        console.warn("[Voice] Could not get daemon URL, using default");
      });
  }, []);

  // ---- Barge-in: stop TTS when user starts speaking ----
  const stopTTS = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {}
      sourceNodeRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ---- TTS: call daemon MiMo TTS API and play audio ----
  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      stopTTS();
      setState("speaking");

      try {
        const response = await fetch(`${daemonUrlRef.current}/api/voice/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, model: "mimo-v2.5-tts" }),
        });

        if (!response.ok) {
          console.warn("[Voice] MiMo TTS failed, falling back to browser TTS");
          speakWithBrowserTTS(text);
          return;
        }

        const audioBuffer = await response.arrayBuffer();
        await playAudioBuffer(audioBuffer);

        if (isRecordingRef.current) {
          startRecording();
        } else {
          setState("idle");
        }
      } catch (err) {
        console.warn("[Voice] TTS error:", err);
        speakWithBrowserTTS(text);
      }
    },
    [stopTTS],
  );

  const playAudioBuffer = useCallback(async (buffer: ArrayBuffer): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      ctx.decodeAudioData(
        buffer,
        (decoded) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(ctx.destination);
          sourceNodeRef.current = source;

          source.onended = () => {
            sourceNodeRef.current = null;
            resolve();
          };

          source.start();
        },
        () => {
          resolve();
        },
      );
    });
  }, []);

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
      // Stop any ongoing TTS first (barge-in)
      stopTTS();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder
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

        // Release mic stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (blob.size < 1000) {
          console.log("[Voice] Audio too small, skipping");
          if (isRecordingRef.current) {
            startRecording();
          } else {
            setState("idle");
          }
          return;
        }

        console.log("[Voice] Audio recorded:", blob.size, "bytes");
        setState("transcribing");

        const text = await transcribeAudio(blob);
        console.log("[Voice] Transcription:", text);

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
      mediaRecorder.start(100); // timeslice: collect data every 100ms
      isRecordingRef.current = true;
      setState("recording");

      // Silence detection via AnalyserNode
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = 0;
      let speechStarted = false;
      const recordingStart = Date.now();
      const SILENCE_THRESHOLD = 15;
      const SILENCE_DURATION = 1500;
      const MAX_RECORDING = 30000;

      const checkVAD = () => {
        if (!isRecordingRef.current || mediaRecorder.state !== "recording") {
          audioCtx.close();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          speechStarted = true;
          silenceStart = 0;
        } else if (speechStarted) {
          if (silenceStart === 0) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            console.log("[Voice] Silence detected, stopping recording");
            mediaRecorder.stop();
            audioCtx.close();
            return;
          }
        }

        // Max recording duration
        if (Date.now() - recordingStart > MAX_RECORDING) {
          console.log("[Voice] Max recording duration reached");
          mediaRecorder.stop();
          audioCtx.close();
          return;
        }

        // No speech for 10s
        if (!speechStarted && Date.now() - recordingStart > 10000) {
          console.log("[Voice] No speech detected for 10s");
          mediaRecorder.stop();
          audioCtx.close();
          return;
        }

        requestAnimationFrame(checkVAD);
      };

      requestAnimationFrame(checkVAD);
    } catch (err) {
      console.error("[Voice] Microphone error:", err);
      setState("idle");
    }
  }, [stopTTS]);

  // Send audio to daemon for transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("language", "zh");

      const url = `${daemonUrlRef.current}/api/voice/transcribe`;
      console.log("[Voice] Sending to:", url);

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[Voice] Transcription failed:", response.status, errText);
        return "";
      }

      const data = (await response.json()) as { text: string; error?: string };
      if (data.error) {
        console.error("[Voice] Transcription error:", data.error);
        return "";
      }
      return data.text;
    } catch (err) {
      console.error("[Voice] Transcription network error:", err);
      return "";
    }
  }, []);

  // ---- Control ----
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

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
        try {
          sourceNodeRef.current.stop();
        } catch {}
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
