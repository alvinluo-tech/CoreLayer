import { useState, useCallback, useRef, useEffect } from "react";
import { getDaemonUrl } from "@/lib/tauri";

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

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
  const vadAudioCtxRef = useRef<AudioContext | null>(null);
  const vadFrameRef = useRef<number>(0);
  const wantsContinuousRef = useRef(false);
  const cancelledRef = useRef(false);

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

  // ---- Cleanup VAD loop ----
  const cleanupVAD = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }
    if (vadAudioCtxRef.current) {
      try {
        vadAudioCtxRef.current.close();
      } catch {}
      vadAudioCtxRef.current = null;
    }
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
          const errBody = await response.text().catch(() => "");
          console.error(`[Voice] MiMo TTS failed (${response.status}): ${errBody}`);
          speakWithBrowserTTS(text);
          return;
        }

        console.log("[Voice] MiMo TTS succeeded");

        const audioBuffer = await response.arrayBuffer();
        await playAudioBuffer(audioBuffer);

        if (wantsContinuousRef.current) {
          // Small delay to avoid picking up TTS tail audio
          setTimeout(() => {
            if (wantsContinuousRef.current) {
              startRecording();
            } else {
              setState("idle");
            }
          }, 300);
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
      if (wantsContinuousRef.current) {
        setTimeout(() => {
          if (wantsContinuousRef.current) {
            startRecording();
          } else {
            setState("idle");
          }
        }, 300);
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
      cancelledRef.current = false;
      // Clean up any previous VAD loop
      cleanupVAD();

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

        // If user cancelled (clicked button), skip processing
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setState("idle");
          return;
        }

        if (blob.size < 2000) {
          console.log("[Voice] Audio too small, skipping");
          if (wantsContinuousRef.current) {
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

        // Filter Whisper hallucinations on silence/noise
        const HALLUCINATION_PATTERNS = [
          "请不吝点赞", "订阅", "转发", "打赏", "支持", "栏目",
          "字幕", "谢谢观看", "谢谢收看", "感谢观看", "下集",
          "拜拜", "再见", "字幕由", "制作", "敬请关注",
        ];
        const isHallucination = text && HALLUCINATION_PATTERNS.some((p) => text.includes(p));

        if (text && text.trim() && !isHallucination) {
          setTranscript(text);
          setState("processing");
          onCommandRef.current(text.trim());
        } else {
          if (wantsContinuousRef.current) {
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
      const vadCtx = new AudioContext();
      vadAudioCtxRef.current = vadCtx;
      const source = vadCtx.createMediaStreamSource(stream);
      const analyser = vadCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const recordingStart = Date.now();
      const SILENCE_THRESHOLD = 20;
      const SILENCE_DURATION = 2000;
      const MAX_RECORDING = 30000;

      const checkVAD = () => {
        if (!isRecordingRef.current || mediaRecorder.state !== "recording") {
          cleanupVAD();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          console.log("[Voice] Silence detected, stopping recording");
          cleanupVAD();
          mediaRecorder.stop();
          return;
        }

        // Max recording duration
        if (Date.now() - recordingStart > MAX_RECORDING) {
          console.log("[Voice] Max recording duration reached");
          cleanupVAD();
          mediaRecorder.stop();
          return;
        }

        vadFrameRef.current = requestAnimationFrame(checkVAD);
      };

      vadFrameRef.current = requestAnimationFrame(checkVAD);
    } catch (err) {
      console.error("[Voice] Microphone error:", err);
      setState("idle");
    }
  }, [stopTTS, cleanupVAD]);

  // Convert webm/blob to WAV format using Web Audio API
  const convertToWav = useCallback(async (blob: Blob): Promise<Blob> => {
    const audioCtx = new AudioContext();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Encode as WAV (16-bit PCM)
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const bytesPerSample = 2;
      const dataSize = length * numChannels * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // WAV header
      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, "WAVE");
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
      view.setUint16(32, numChannels * bytesPerSample, true);
      view.setUint16(34, 16, true); // bits per sample
      writeString(view, 36, "data");
      view.setUint32(40, dataSize, true);

      // Interleave channels and write samples
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        channels.push(audioBuffer.getChannelData(ch));
      }

      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = Math.max(-1, Math.min(1, channels[ch]![i] ?? 0));
          view.setInt16(offset, sample * 0x7fff, true);
          offset += 2;
        }
      }

      return new Blob([buffer], { type: "audio/wav" });
    } finally {
      await audioCtx.close();
    }
  }, []);

  // Send audio to daemon for transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      // Convert to WAV for Groq Whisper compatibility
      const wavBlob = await convertToWav(audioBlob);
      console.log(`[Voice] Converted ${audioBlob.size}B webm → ${wavBlob.size}B wav`);

      const formData = new FormData();
      formData.append("audio", wavBlob, "audio.wav");
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
  }, [convertToWav]);

  // ---- Control ----
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    wantsContinuousRef.current = false;
    cancelledRef.current = true;
    cleanupVAD();

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [cleanupVAD]);

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
      wantsContinuousRef.current = true;
      startRecording();
    }
  }, [state, startRecording, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      wantsContinuousRef.current = false;
      cleanupVAD();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {}
      }
    };
  }, [cleanupVAD]);

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
