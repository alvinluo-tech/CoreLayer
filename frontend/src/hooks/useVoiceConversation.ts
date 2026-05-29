import { useState, useCallback, useRef, useEffect } from "react";
import { getDaemonUrl } from "@/lib/tauri";
import { splitSentences } from "@/lib/sentenceSplitter";
import { AudioQueueManager } from "@/lib/audioQueue";
import { startAudioCapture, encodeWav } from "@/lib/audioCapture";
import {
  createWebSpeechASR,
  isWebSpeechASRAvailable,
  type WebSpeechASR,
} from "@/lib/webSpeechASR";

export type VoiceConversationState =
  | "idle"
  | "listening"
  | "transcribing"
  | "streaming"
  | "speaking"
  | "error";

const HALLUCINATION_PATTERNS = [
  "请不吝点赞", "订阅", "转发", "打赏", "支持", "栏目",
  "字幕", "谢谢观看", "谢谢收看", "感谢观看", "下集",
  "拜拜", "再见", "字幕由", "制作", "敬请关注",
];

export function useVoiceConversation(
  conversationId: string | null,
  onIdle?: () => void,
  createConversation?: () => Promise<{ id: string }>,
) {
  const [state, setState] = useState<VoiceConversationState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const daemonUrlRef = useRef<string>("http://127.0.0.1:3001");
  const audioQueueRef = useRef<AudioQueueManager | null>(null);
  const webAsrRef = useRef<WebSpeechASR | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const prevStateRef = useRef<VoiceConversationState>("idle");
  const lastStreamedTextRef = useRef("");
  const postListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startConversationRef = useRef<(text: string) => void>(() => {});
  const lastUserTextRef = useRef("");
  const bargeInMonitorRef = useRef<{ stop: () => void } | null>(null);
  const bargeInRef = useRef<() => void>(() => {});


  const POST_LISTEN_TIMEOUT = 7000; // 7s silence → back to wake word


  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // Start post-conversation listening window (7s to speak, then wake word)
  const startPostConversationListen = useCallback(() => {
    console.log(`[VoiceConversation] startPostConversationListen called, isActive: ${isActiveRef.current}`);
    if (isActiveRef.current) return;
    console.log("[VoiceConversation] Starting post-conversation listen (7s window)");
    isActiveRef.current = true;
    setState("listening");
    setInterimTranscript("");

    if (isWebSpeechASRAvailable()) {
      let gotResult = false;

      // 7s timeout — if no speech, go to wake word mode
      postListenTimerRef.current = setTimeout(() => {
        if (gotResult) return;
        console.log("[VoiceConversation] Post-listen timeout (7s), back to wake word");
        if (webAsrRef.current) {
          webAsrRef.current.stop();
          webAsrRef.current = null;
        }
        isActiveRef.current = false;
        setState("idle");
      }, POST_LISTEN_TIMEOUT);

      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          if (isActiveRef.current) setInterimTranscript(text);
        },
        onFinal: (text) => {
          if (!isActiveRef.current) return;
          gotResult = true;
          if (postListenTimerRef.current) {
            clearTimeout(postListenTimerRef.current);
            postListenTimerRef.current = null;
          }
          webAsrRef.current = null;
          isActiveRef.current = false;
          startConversationRef.current(text);
        },
        onError: (err) => {
          console.warn("[VoiceConversation] Post-listen ASR error:", err);
        },
        onEnd: () => {
          console.log("[VoiceConversation] Post-listen ASR ended, gotResult:", gotResult);
          if (gotResult) return;
          if (postListenTimerRef.current) {
            clearTimeout(postListenTimerRef.current);
            postListenTimerRef.current = null;
          }
          if (isActiveRef.current) {
            isActiveRef.current = false;
            setState("idle");
          }
        },
        silenceTimeout: POST_LISTEN_TIMEOUT,
      });
      webAsrRef.current = asr;
      asr.start();
    } else {
      // No Web Speech API — fall back to immediate wake word
      console.warn("[VoiceConversation] Web Speech API not available, falling back to wake word");
      isActiveRef.current = false;
      setState("idle");
    }
  }, []);

  // When transitioning from active state to idle:
  // - After conversation (speaking → idle): start post-conversation listening
  // - After post-listen timeout (listening → idle): go to wake word
  useEffect(() => {
    if (state === "idle" && prevStateRef.current !== "idle") {
      console.log(`[VoiceConversation] Transition: ${prevStateRef.current} → idle, isActive: ${isActiveRef.current}`);
      if (prevStateRef.current === "speaking" || prevStateRef.current === "streaming") {
        // AI just finished — start post-conversation listen window
        startPostConversationListen();
      } else {
        // Post-listen timeout or manual stop — back to wake word
        console.log("[VoiceConversation] Back to wake word mode");
        onIdleRef.current?.();
      }
    }
    prevStateRef.current = state;
  }, [state, startPostConversationListen]);

  useEffect(() => {
    setIsSupported(
      Boolean(navigator.mediaDevices?.getUserMedia) || isWebSpeechASRAvailable(),
    );
    getDaemonUrl()
      .then((url) => {
        daemonUrlRef.current = url;
      })
      .catch(() => {});
  }, []);

  const cleanup = useCallback(() => {
    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.stop();
      bargeInMonitorRef.current = null;
    }
    if (postListenTimerRef.current) {
      clearTimeout(postListenTimerRef.current);
      postListenTimerRef.current = null;
    }
    if (webAsrRef.current) {

      webAsrRef.current.stop();
      webAsrRef.current = null;
    }
    if (audioQueueRef.current) {
      audioQueueRef.current.dispose();
      audioQueueRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // --- Batch ASR fallback (P0) ---
  const transcribeWithWhisper = useCallback(async (): Promise<string> => {
    const capture = await startAudioCapture();
    const SILENCE_THRESHOLD = 20;
    const SILENCE_DURATION = 2000;
    const MAX_RECORDING = 30000;

    return new Promise<string>((resolve) => {
      const dataArray = new Uint8Array(capture.analyser.frequencyBinCount);
      let silenceStart = Date.now();
      const recordingStart = Date.now();

      const checkVAD = () => {
        if (!isActiveRef.current) {
          capture.stop();
          resolve("");
          return;
        }

        capture.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg > SILENCE_THRESHOLD) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
          capture.stop();
          processAudio();
          return;
        }

        if (Date.now() - recordingStart > MAX_RECORDING) {
          capture.stop();
          processAudio();
          return;
        }

        requestAnimationFrame(checkVAD);
      };

      const processAudio = async () => {
        const wavBlob = encodeWav(capture.pcmChunks, 16000);
        if (wavBlob.size < 2000) {
          resolve("");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("audio", wavBlob, "audio.wav");
          formData.append("language", "zh");

          const response = await fetch(
            `${daemonUrlRef.current}/api/voice/transcribe`,
            { method: "POST", body: formData },
          );

          if (!response.ok) {
            resolve("");
            return;
          }

          const data = (await response.json()) as { text: string };
          const text = data.text?.trim() || "";
          const isHallucination = HALLUCINATION_PATTERNS.some((p) =>
            text.includes(p),
          );
          resolve(isHallucination ? "" : text);
        } catch {
          resolve("");
        }
      };

      requestAnimationFrame(checkVAD);
    });
  }, []);

  // --- LLM Streaming ---
  const streamLLMResponse = useCallback(
    async function* (message: string, convId?: string | null) {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await fetch(
        `${daemonUrlRef.current}/api/voice/converse-stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            conversationId: convId || undefined,
          }),
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Stream error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "token";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (!data) continue;

            if (currentEvent === "token") {
              yield data;
            } else if (currentEvent === "error") {
              try {
                const parsed = JSON.parse(data) as { error: string };
                throw new Error(parsed.error);
              } catch (e) {
                if (e instanceof Error && e.message !== "error") throw e;
              }
            }
            currentEvent = "token"; // reset for next event
          }
        }
      }
    },
    [],
  );

  const startBargeInMonitor = useCallback(() => {
    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.stop();
      bargeInMonitorRef.current = null;
    }

    let stopped = false;
    let micStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let animationFrameId = 0;

    const stop = () => {
      stopped = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
    };

    bargeInMonitorRef.current = { stop };

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
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const BARGE_IN_THRESHOLD = 50; // Raised from 30 to 50 to filter out fan noise, speaker leak, and deep breathing
        let sustainedVoiceDuration = 0;
        const CHECK_INTERVAL = 100;

        let lastCheck = Date.now();

        const checkFrame = () => {
          if (stopped) return;

          const now = Date.now();
          if (now - lastCheck >= CHECK_INTERVAL) {
            lastCheck = now;
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

            if (avg > BARGE_IN_THRESHOLD) {
              sustainedVoiceDuration += CHECK_INTERVAL;
              if (sustainedVoiceDuration >= 450) { // Raised from 200ms to 450ms to verify intentional spoken words instead of micro-noises
                console.log("[VoiceConversation:BargeIn] Voice activity detected! Interrupting AI...");
                stop();
                bargeInRef.current(); // Call barge-in via ref
                return;
              }
            } else {
              sustainedVoiceDuration = Math.max(0, sustainedVoiceDuration - CHECK_INTERVAL);
            }
          }

          animationFrameId = requestAnimationFrame(checkFrame);
        };

        checkFrame();
      })
      .catch((err) => {
        console.warn("[VoiceConversation:BargeIn] Failed to start barge-in mic monitor:", err);
      });
  }, []);

  // --- Main conversation flow ---
  const startConversation = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isActiveRef.current) return;

      // Ensure a conversation exists
      let convId = conversationId;
      if (!convId && createConversation) {
        try {
          const conv = await createConversation();
          convId = conv.id;
        } catch (err) {
          console.error("[VoiceConversation] Failed to create conversation:", err);
        }
      }

      isActiveRef.current = true;
      setState("streaming");
      setAssistantText("");
      setFinalTranscript(userText);
      lastUserTextRef.current = userText;
      setInterimTranscript("");

      const queue = new AudioQueueManager(
        `${daemonUrlRef.current}/api/voice/synthesize`,
        "茉莉",
      );
      audioQueueRef.current = queue;

      startBargeInMonitor(); // Start background VAD voice barge-in monitor!

      try {
        let textBuffer = "";

        let fullText = "";
        let sentenceIndex = 0;

        for await (const token of streamLLMResponse(userText, convId)) {
          if (!isActiveRef.current) break;

          textBuffer += token;
          fullText += token;
          setAssistantText(fullText);

          const { complete, remainder } = splitSentences(textBuffer, sentenceIndex === 0);
          for (const sentence of complete) {
            queue.enqueue(sentence, sentenceIndex++);
          }
          textBuffer = remainder;
        }

        // Flush remaining text
        if (textBuffer.trim() && isActiveRef.current) {
          queue.enqueue(textBuffer.trim(), sentenceIndex++);
        }

        queue.setTotalExpected(sentenceIndex);

        // Transition to speaking when first audio starts playing
        if (sentenceIndex > 0) {
          setState("speaking");
          await queue.waitForCompletion();
        }

        // Done — keep assistantText visible until persisted messages load
        if (isActiveRef.current) {
          lastStreamedTextRef.current = fullText;
          console.log("[VoiceConversation] Stream done, setting isActive=false, state→idle");
          isActiveRef.current = false;
          setState("idle");
          setInterimTranscript("");
          setFinalTranscript("");
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[VoiceConversation] Error:", error);
          setState("error");
          setTimeout(() => {
            if (isActiveRef.current) setState("idle");
          }, 2000);
        }
      } finally {
        cleanup();
      }
    },
    [streamLLMResponse, cleanup, conversationId, createConversation],
  );

  // Keep ref in sync for post-conversation listen
  startConversationRef.current = startConversation;

  // --- Start listening (Web Speech API or batch fallback) ---
  const startListening = useCallback(() => {
    if (isActiveRef.current) return;
    isActiveRef.current = true;
    setState("listening");
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantText("");

    if (isWebSpeechASRAvailable()) {
      let gotFinalResult = false;
      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          if (isActiveRef.current) setInterimTranscript(text);
        },
        onFinal: (text) => {
          if (!isActiveRef.current) return;
          gotFinalResult = true;
          webAsrRef.current = null;
          isActiveRef.current = false;
          startConversation(text);
        },
        onError: (err) => {
          console.warn("[VoiceConversation] ASR error:", err);
        },
        onEnd: () => {
          if (gotFinalResult) return;
          if (isActiveRef.current) {
            isActiveRef.current = false;
            setState("idle");
          }
        },
        silenceTimeout: 2500,
      });
      webAsrRef.current = asr;
      asr.start();
    } else {
      // Batch ASR fallback
      setState("transcribing");
      transcribeWithWhisper().then((text) => {
        if (!isActiveRef.current) return;
        if (text) {
          startConversation(text);
        } else {
          isActiveRef.current = false;
          setState("idle");
        }
      });
    }
  }, [transcribeWithWhisper, startConversation]);

  // --- Stop / Barge-in ---
  const stopConversation = useCallback(() => {
    isActiveRef.current = false;
    cleanup();
    lastStreamedTextRef.current = "";
    setState("idle");
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantText("");
  }, [cleanup]);

  const bargeIn = useCallback(() => {
    // Stop TTS playback and abort LLM stream
    if (audioQueueRef.current) {
      audioQueueRef.current.stop();
      audioQueueRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Go back to listening
    isActiveRef.current = true;
    setState("listening");
    setAssistantText("");
    setInterimTranscript("");

    if (isWebSpeechASRAvailable()) {
      let gotFinalResult = false;
      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          if (isActiveRef.current) setInterimTranscript(text);
        },
        onFinal: (text) => {
          if (!isActiveRef.current) return;
          gotFinalResult = true;
          webAsrRef.current = null;
          isActiveRef.current = false;
          startConversation(text);
        },
        onEnd: () => {
          if (gotFinalResult) return;
          if (isActiveRef.current) {
            isActiveRef.current = false;
            setState("idle");
          }
        },
        silenceTimeout: 2500,
      });
      webAsrRef.current = asr;
      asr.start();
    }
  }, [startConversation]);

  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  // Cleanup on unmount


  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Clear persisted text when new messages arrive from server
  const clearLastStreamedText = useCallback(() => {
    lastStreamedTextRef.current = "";
    lastUserTextRef.current = "";
  }, []);

  // Display logic: show live text during streaming, keep ref text after
  const displayAssistantText =
    state === "streaming" || state === "speaking"
      ? assistantText
      : lastStreamedTextRef.current || "";

  const displayUserText =
    state === "streaming" || state === "speaking" || state === "listening"
      ? finalTranscript
      : lastUserTextRef.current || "";

  return {
    state,
    interimTranscript,
    finalTranscript: displayUserText,
    assistantText: displayAssistantText,
    isSupported,
    startListening,
    stopConversation,
    bargeIn,
    startConversation,
    clearLastStreamedText,
  };
}
