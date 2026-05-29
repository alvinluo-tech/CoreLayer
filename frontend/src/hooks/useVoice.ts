import { useState, useCallback, useRef, useEffect } from "react";
import { getDaemonUrl } from "@/lib/tauri";
import { voiceProfileManager } from "@/lib/voiceProfile";
import { jarvisClient } from "@/lib/jarvisClient";
import { useWakeWord } from "./useWakeWord";
import { encodeWav } from "@/lib/audioCapture";


export type VoiceState = "idle" | "recording" | "transcribing" | "processing" | "speaking";

export function useVoice(onCommand: (text: string) => void, onWake?: () => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isRecordingRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const streamRef = useRef<MediaStream | null>(null);
  const daemonUrlRef = useRef<string>("http://127.0.0.1:3001");
  const vadAudioCtxRef = useRef<AudioContext | null>(null);
  const vadFrameRef = useRef<number>(0);
  const wantsContinuousRef = useRef(false);
  const cancelledRef = useRef(false);
  const stopRecordingFnRef = useRef<(() => void) | null>(null);

  // Wake word detection
  const handleWake = useCallback(() => {
    console.log("[Voice] Wake word triggered, stopping wake word engine");
    wakeWord.stop();
    if (onWake) {
      // Add a 300ms delay to allow the browser to fully release the microphone from wake word SpeechRecognition
      setTimeout(() => {
        onWake();
      }, 300);
    } else {
      wantsContinuousRef.current = true;
      setTimeout(() => {
        startRecording();
      }, 300);
    }
  }, [onWake]);

  const wakeWord = useWakeWord(handleWake, daemonUrlRef.current);

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
        const audioBuffer = await jarvisClient.synthesize(text, undefined, voiceProfileManager.getTTSModel());
        await playAudioBuffer(audioBuffer);

        if (wantsContinuousRef.current) {
          // Small delay to avoid picking up TTS tail audio, then restart wake word
          setTimeout(() => {
            if (wantsContinuousRef.current) {
              wakeWord.start();
              setState("idle");
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
            wakeWord.start();
            setState("idle");
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
      cleanupVAD();
      stopTTS();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use AudioContext to capture raw PCM data (avoids webm decode issues)
      const recordCtx = new AudioContext({ sampleRate: 16000 });
      const source = recordCtx.createMediaStreamSource(stream);
      const processor = recordCtx.createScriptProcessor(4096, 1, 1);
      const pcmChunks: Float32Array[] = [];

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const data = e.inputBuffer.getChannelData(0);
        pcmChunks.push(new Float32Array(data));
      };

      source.connect(processor);
      processor.connect(recordCtx.destination);

      isRecordingRef.current = true;
      setState("recording");

      // VAD using AnalyserNode on the same context
      const analyser = recordCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const recordingStart = Date.now();
      const SILENCE_THRESHOLD = 20;
      const SILENCE_DURATION = 2000;
      const MAX_RECORDING = 30000;

      const doStop = () => {
        isRecordingRef.current = false;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        cleanupVAD();
      };
      stopRecordingFnRef.current = doStop;

      const stopAndProcess = async () => {
        doStop();

        // If cancelled, skip processing
        if (cancelledRef.current) {
          cancelledRef.current = false;
          try { await recordCtx.close(); } catch {}
          setState("idle");
          return;
        }

        // Encode PCM as WAV
        const wavBlob = encodeWav(pcmChunks, recordCtx.sampleRate);
        try { await recordCtx.close(); } catch {}

        if (wavBlob.size < 2000) {
          console.log("[Voice] Audio too small, skipping");
          if (wantsContinuousRef.current) {
            wakeWord.start();
            setState("idle");
          } else {
            setState("idle");
          }
          return;
        }

        console.log("[Voice] Audio recorded:", wavBlob.size, "bytes");
        setState("transcribing");

        const text = await transcribeAudio(wavBlob);
        console.log("[Voice] Transcription:", text);

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
            wakeWord.start();
            setState("idle");
          } else {
            setState("idle");
          }
        }
      };

      const checkVAD = () => {
        if (!isRecordingRef.current) {
          cleanupVAD();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          console.log("[Voice] Silence detected, stopping recording");
          stopAndProcess();
          return;
        }

        if (Date.now() - recordingStart > MAX_RECORDING) {
          console.log("[Voice] Max recording duration reached");
          stopAndProcess();
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

  // Send audio to daemon for transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      return await jarvisClient.transcribe(audioBlob, "zh");
    } catch (err) {
      console.error("[Voice] Transcription error:", err);
      return "";
    }
  }, []);

  // ---- Control ----
  const stopRecording = useCallback(() => {
    cancelledRef.current = true;
    wantsContinuousRef.current = false;

    if (stopRecordingFnRef.current) {
      stopRecordingFnRef.current();
      stopRecordingFnRef.current = null;
    } else {
      isRecordingRef.current = false;
      cleanupVAD();
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
      wakeWord.stop();
    } else if (wakeWord.isListening) {
      wakeWord.stop();
      wantsContinuousRef.current = false;
      setState("idle");
    } else {
      wantsContinuousRef.current = true;
      wakeWord.start();
    }
  }, [state, startRecording, stopListening, wakeWord]);

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
    isWakeWordListening: wakeWord.isListening,
    wakeWordMethod: wakeWord.method,
    wakeWordError: wakeWord.error,
    startListening: startRecording,
    stopListening,
    toggleListening,
    speak,
    stopTTS,
  };
}
