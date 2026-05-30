import { useState, useCallback, useRef, useEffect } from "react";
import { getDaemonUrl } from "@/lib/tauri";
import { splitSentences } from "@/lib/sentenceSplitter";
import { AudioQueueManager } from "@/lib/audioQueue";
import { voiceProfileManager } from "@/lib/voiceProfile";
import { jarvisClient } from "@/lib/jarvisClient";
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

function getSpokenText(text: string): string {
  let result = "";
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    const thoughtStart = text.indexOf("<thought>", currentIndex);
    if (thoughtStart === -1) {
      result += text.slice(currentIndex);
      break;
    }
    
    result += text.slice(currentIndex, thoughtStart);
    
    const thoughtEnd = text.indexOf("</thought>", thoughtStart);
    if (thoughtEnd === -1) {
      break; // Thought block is open and not closed yet; strip subsequent streaming tokens
    }
    
    currentIndex = thoughtEnd + "</thought>".length;
  }
  
  return result;
}

function playSciFiChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    
    // Osc 1 - High bell chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15); // A6
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    // Osc 2 - Harmony chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1108.73, now); // C#6
    osc2.frequency.exponentialRampToValueAtTime(2217.46, now + 0.2); // C#7
    
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.8);
    
    osc2.start(now);
    osc2.stop(now + 0.8);
  } catch (e) {
    console.warn("Failed to play sci-fi chime programmatically:", e);
  }
}

export function useVoiceConversation(
  conversationId: string | null,
  onIdle?: () => void,
  createConversation?: () => Promise<{ id: string }>,
) {
  const [state, setState] = useState<VoiceConversationState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"centered" | "bottom-right">("centered");
  const isAppFocusedRef = useRef(true);
  const originalBoundsRef = useRef<{
    size: any;
    position: any;
  } | null>(null);

  const daemonUrlRef = useRef<string>("http://127.0.0.1:3001");
  const audioQueueRef = useRef<AudioQueueManager | null>(null);
  const webAsrRef = useRef<WebSpeechASR | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  const prevStateRef = useRef<VoiceConversationState>("idle");
  const lastStreamedTextRef = useRef("");
  const postListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startConversationRef = useRef<(text: string) => void>(() => {});
  const lastUserTextRef = useRef("");
  const bargeInMonitorRef = useRef<{ stop: () => void } | null>(null);
  const bargeInRef = useRef<() => void>(() => {});
  const isFarewellPlayingRef = useRef(false);
  const playFarewellAndExitRef = useRef<() => void>(() => {});
  const greetingAudioCtxRef = useRef<AudioContext | null>(null);
  const greetingSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);



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
    setFinalTranscript("");

    if (isWebSpeechASRAvailable()) {
      let gotResult = false;
      let latestInterimText = "";

      // 7s timeout — if no speech, go to wake word mode
      postListenTimerRef.current = setTimeout(() => {
        if (gotResult) return;
        console.log("[VoiceConversation] Post-listen timeout (7s), checking for interim text");
        
        if (latestInterimText.trim()) {
          console.log("[VoiceConversation] Post-listen timeout but got interim text, submitting:", latestInterimText);
          gotResult = true;
          if (webAsrRef.current) {
            webAsrRef.current.stop();
            webAsrRef.current = null;
          }
          isActiveRef.current = false;
          startConversationRef.current(latestInterimText);
          return;
        }

        if (webAsrRef.current) {
          webAsrRef.current.stop();
          webAsrRef.current = null;
        }
        isActiveRef.current = false;
        playFarewellAndExitRef.current();
      }, POST_LISTEN_TIMEOUT);

      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          // Cancel the post-listen timeout because the user has started speaking!
          if (postListenTimerRef.current) {
            clearTimeout(postListenTimerRef.current);
            postListenTimerRef.current = null;
          }
          setInterimTranscript(text);
          latestInterimText = text;
        },
        onFinal: (text) => {
          gotResult = true;
          if (postListenTimerRef.current) {
            clearTimeout(postListenTimerRef.current);
            postListenTimerRef.current = null;
          }
          if (webAsrRef.current) {
            webAsrRef.current.stop();
            webAsrRef.current = null;
          }
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
          if (latestInterimText.trim()) {
            console.log("[VoiceConversation] Post-listen ASR ended but got interim text, submitting:", latestInterimText);
            gotResult = true;
            isActiveRef.current = false;
            startConversationRef.current(latestInterimText);
          } else {
            isActiveRef.current = false;
            playFarewellAndExitRef.current();
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
      playFarewellAndExitRef.current();
    }
  }, []);

  // When transitioning to idle state, return to wake word mode
  useEffect(() => {
    if (state === "idle" && prevStateRef.current !== "idle") {
      console.log(`[VoiceConversation] Transition: ${prevStateRef.current} → idle, isActive: ${isActiveRef.current}`);
      if (isFarewellPlayingRef.current) {
        isFarewellPlayingRef.current = false;
        console.log("[VoiceConversation] Farewell completed. Back to wake word mode.");
      } else {
        console.log("[VoiceConversation] Stopped or timed out. Back to wake word mode.");
      }
      onIdleRef.current?.();
    }
    prevStateRef.current = state;
  }, [state]);

  const restoreWindow = useCallback(async () => {
    if (typeof window === "undefined" || !originalBoundsRef.current) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const { size, position } = originalBoundsRef.current;
      
      console.log("[Tauri Window] Restoring original window bounds...", originalBoundsRef.current);
      await appWindow.setAlwaysOnTop(false).catch(() => {});
      await appWindow.setDecorations(true).catch(() => {});
      if (size) {
        await appWindow.setSize(size).catch(() => {});
      }
      if (position) {
        await appWindow.setPosition(position).catch(() => {});
      }
    } catch (e) {
      console.warn("Failed to restore window bounds:", e);
    } finally {
      originalBoundsRef.current = null;
    }
  }, []);

  // Synchronize Tauri Window bounds, decorations, and focus based on voice conversation state
  useEffect(() => {
    // We no longer manipulate the main window size/focus here to prevent focus-stealing
    // and allow normal multitasking. Let the main window behave normally.
    return;
    
    const isAssistant = typeof window !== "undefined" && window.location.search.includes("assistant=true");
    if (isAssistant) return;

    const isActive = state !== "idle";
    const syncWindow = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        
        if (isActive) {
          // If the app was not focused when triggered, shrink it and place in bottom-right
          if (!isAppFocusedRef.current) {
            console.log("[Tauri Window] App not focused. Entering system-level bottom-right overlay mode...");
            
            // Only capture original bounds if we haven't already
            if (!originalBoundsRef.current) {
              const size = await appWindow.outerSize().catch(() => null);
              const position = await appWindow.outerPosition().catch(() => null);
              originalBoundsRef.current = { size, position };
              console.log("[Tauri Window] Saved original bounds:", originalBoundsRef.current);
            }
            
            // Apply borderless, shrunken dimensions, always-on-top
            await appWindow.setDecorations(false).catch(() => {});
            await appWindow.setAlwaysOnTop(true).catch(() => {});
            
            const { LogicalSize, LogicalPosition } = await import("@tauri-apps/api/dpi");
            await appWindow.setSize(new LogicalSize(360, 440)).catch(() => {});
            
            const { currentMonitor } = await import("@tauri-apps/api/window");
            const monitor = await currentMonitor().catch(() => null);
            if (monitor) {
              const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
              const scaleFactor = monitor.scaleFactor || 1;
              
              const workWidthLogical = workArea.size.width / scaleFactor;
              const workHeightLogical = workArea.size.height / scaleFactor;
              const workXLogical = workArea.position.x / scaleFactor;
              const workYLogical = workArea.position.y / scaleFactor;
              
              const winWidth = 360;
              const winHeight = 440;
              const margin = 20;
              
              const targetX = workXLogical + workWidthLogical - winWidth - margin;
              const targetY = workYLogical + workHeightLogical - winHeight - margin;
              
              await appWindow.setPosition(new LogicalPosition(targetX, targetY)).catch(() => {});
            }
          } else {
            console.log("[Tauri Window] App is already focused. Showing centered overlay inside application.");
            // Just ensure always on top without shrinking
            await appWindow.setAlwaysOnTop(true).catch(() => {});
          }
          
          await appWindow.show().catch(() => {});
          await appWindow.unminimize().catch(() => {});
          await appWindow.setFocus().catch(() => {});
        } else {
          console.log("[Tauri Window] Voice state is idle. Restoring window...");
          await restoreWindow();
        }
      } catch (e) {
        console.warn("[Tauri Window] Window manipulation failed:", e);
      }
    };
    syncWindow();
  }, [state, restoreWindow]);

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
    if (breathingTimerRef.current) {
      clearTimeout(breathingTimerRef.current);
      breathingTimerRef.current = null;
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
    
    // Stop any active Realtime WebSocket socket
    if ((window as any)._realtimeSocket) {
      try {
        (window as any)._realtimeSocket.close();
      } catch {}
      (window as any)._realtimeSocket = null;
    }

    // Stop WebRTC peer connection & media resources
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
      } catch {}
      remoteAudioRef.current = null;
    }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }
    
    // Stop any active greeting audio playback immediately
    if (greetingSourceRef.current) {
      try {
        greetingSourceRef.current.stop();
      } catch {}
      greetingSourceRef.current = null;
    }
    if (greetingAudioCtxRef.current) {
      try {
        greetingAudioCtxRef.current.close();
      } catch {}
      greetingAudioCtxRef.current = null;
    }
  }, []);

  const cleanupStreaming = useCallback(() => {
    if (bargeInMonitorRef.current) {
      bargeInMonitorRef.current.stop();
      bargeInMonitorRef.current = null;
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

  const connectRealtimeSession = useCallback(async () => {
    // 1. Clean up any existing connection first
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
      } catch {}
      remoteAudioRef.current = null;
    }
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch {}
      dataChannelRef.current = null;
    }

    try {
      setState("listening");
      setAssistantText("正在初始化超清实时语音...");
      
      // 2. Fetch session from backend
      const response = await fetch(`${daemonUrlRef.current}/api/voice/realtime-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        let errMessage = "未能建立实时语音会话，请确认 API Key 是否正确配置";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMessage = errData.error;
          }
        } catch {}
        throw new Error(errMessage);
      }
      
      const sessionData = await response.json();
      const ephemeralKey = sessionData.client_secret.value;

      // 3. Create WebRTC Peer Connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // 4. Setup remote audio element
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        console.log("[VoiceConversation:Realtime] Got remote audio track");
        if (event.streams && event.streams[0]) {
          audioEl.srcObject = event.streams[0];
        }
      };

      // 5. Add local microphone track
      console.log("[VoiceConversation:Realtime] Requesting microphone stream...");
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = localStream;
      
      const track = localStream.getTracks()[0];
      if (track) {
        pc.addTrack(track, localStream);
      } else {
        throw new Error("未能捕获麦克风音频轨道");
      }

      // 6. Setup DataChannel for text/state events
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log("[VoiceConversation:Realtime] Data channel established");
        setAssistantText("连线上啦！主人，随时可以对我说任何话。");
        setTimeout(() => {
          if (isActiveRef.current) {
            setAssistantText("主人，请讲，我在听。");
          }
        }, 1500);
      };

      let realtimeAssistantBuffer = "";

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("[VoiceConversation:Realtime] Message:", msg.type, msg);

          switch (msg.type) {
            case "response.created":
              setState("streaming");
              realtimeAssistantBuffer = "";
              setAssistantText("");
              break;
            case "response.audio_transcript.delta":
              if (msg.delta) {
                realtimeAssistantBuffer += msg.delta;
                setState("speaking");
                setAssistantText(realtimeAssistantBuffer);
              }
              break;
            case "response.audio_transcript.done":
              setState("listening");
              break;
            case "conversation.item.input_audio_transcription.completed":
              if (msg.transcript) {
                setFinalTranscript(msg.transcript);
              }
              break;
            case "input_audio_buffer.speech_started":
              console.log("[VoiceConversation:Realtime] Speech started (VAD barge-in)");
              setState("listening");
              break;
            case "error":
              console.error("[VoiceConversation:Realtime] Error event:", msg.error);
              setAssistantText(`实时连接异常: ${msg.error?.message || "未知错误"}`);
              break;
          }
        } catch (err) {
          console.warn("[VoiceConversation:Realtime] Failed to parse event:", err);
        }
      };

      // 7. Exchange SDP Offer / Answer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime/calls?model=gpt-4o-realtime-preview`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          "Authorization": `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        }
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`OpenAI SDP Exchange failed: ${errText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      console.log("[VoiceConversation:Realtime] WebRTC Connection fully established!");

    } catch (error) {
      const message = error instanceof Error ? error.message : "连接 ChatGPT Realtime 失败，请检查网络或配置";
      console.error("[VoiceConversation:Realtime] Initialization error:", error);
      setState("error");
      setLastError(message);
      setAssistantText(message);
      setTimeout(() => {
        if (isActiveRef.current) setState("idle");
      }, 4000);
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
          const text = await jarvisClient.transcribe(wavBlob, "zh");
          const trimmed = text?.trim() || "";
          const isHallucination = HALLUCINATION_PATTERNS.some((p) =>
            trimmed.includes(p),
          );
          resolve(isHallucination ? "" : trimmed);
        } catch (err) {
          console.warn("[VoiceConversation] transcribeWithWhisper failed:", err);
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
        const BARGE_IN_THRESHOLD = 62; // Raised from 50 to 62 to highly filter out speaker output leak, loud keyboard typing, fan noise, and breathing
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
              if (sustainedVoiceDuration >= 750) { // Raised from 450ms to 750ms to verify intentional, continuous spoken words instead of transient clicks or echo spikes
                // Only barge-in if the AI is actively playing synthesized voice audio.
                // If the AI is still "thinking" (generating text) or silent, we ignore environmental noises.
                const isTtsPlaying = audioQueueRef.current && audioQueueRef.current.isPlaying;
                if (isTtsPlaying) {
                  console.log("[VoiceConversation:BargeIn] Voice activity detected! Interrupting AI...");
                  stop();
                  bargeInRef.current(); // Call barge-in via ref
                  return;
                } else {
                  sustainedVoiceDuration = 0; // Reset accumulation since AI is not speaking yet
                }
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
      if (!userText.trim()) return;

      // 1. State Isolation: Block any duplicate triggers if the AI is already streaming or speaking
      if (isActiveRef.current && (state === "streaming" || state === "speaking")) {
        console.warn("[VoiceConversation] Conversation already in progress, ignoring duplicate trigger");
        return;
      }

      if (!isActiveRef.current) {
        lastStreamedTextRef.current = "";
        lastUserTextRef.current = "";
        const isFocused = document.hasFocus();
        isAppFocusedRef.current = isFocused;
        setLayoutMode(isFocused ? "centered" : "bottom-right");
      }

      // Ensure a conversation exists
      let convId = conversationId;
      if (!convId && createConversation) {
        try {
          const conv = await createConversation();
          convId = conv.id;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[VoiceConversation] Failed to create conversation:", err);
          setLastError(message);
          setState("error");
          setAssistantText(`无法创建对话: ${message}`);
          isActiveRef.current = false;
          return;
        }
      }

      // 2. Failsafe Cleanup: Force stop and dispose any lingering audio queues or streams before creating new ones
      if (audioQueueRef.current) {
        try { audioQueueRef.current.dispose(); } catch {}
        audioQueueRef.current = null;
      }
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
        abortControllerRef.current = null;
      }

      isActiveRef.current = true;
      setState("streaming");
      setAssistantText("");
      setFinalTranscript(userText);
      lastUserTextRef.current = userText;
      setInterimTranscript("");

      const queue = new AudioQueueManager(
        `${daemonUrlRef.current}/api/voice/synthesize`,
      );
      audioQueueRef.current = queue;

      startBargeInMonitor(); // Start background VAD voice barge-in monitor!

      try {
        let fullText = "";
        let processedSpokenLength = 0;
        let ttsBuffer = "";
        let sentenceIndex = 0;

        for await (const token of streamLLMResponse(userText, convId)) {
          if (!isActiveRef.current) break;

          fullText += token;
          setAssistantText(fullText);

          // Get the total clean spoken text generated so far
          const spokenText = getSpokenText(fullText);
          
          // Get the newly generated clean spoken text since last loop
          if (spokenText.length > processedSpokenLength) {
            const newSpokenChars = spokenText.slice(processedSpokenLength);
            ttsBuffer += newSpokenChars;
            processedSpokenLength = spokenText.length;
          }

          const { complete, remainder } = splitSentences(ttsBuffer, sentenceIndex);
          for (const sentence of complete) {
            queue.enqueue(sentence, sentenceIndex++);
          }
          ttsBuffer = remainder;
        }

        // Flush remaining text
        if (ttsBuffer.trim() && isActiveRef.current) {
          queue.enqueue(ttsBuffer.trim(), sentenceIndex++);
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
          console.log("[VoiceConversation] Audio done, waiting 800ms breathing delay...");
          
          await new Promise<void>((resolve) => {
            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }
            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              resolve();
            }, 800);
          });
          
          if (isActiveRef.current) {
            console.log("[VoiceConversation] Breathing pause done, starting post-conversation listen...");
            isActiveRef.current = false;
            startPostConversationListen();
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[VoiceConversation] Error:", error);
          setLastError(message);
          setState("error");
          setTimeout(() => {
            if (isActiveRef.current) setState("idle");
          }, 2000);
        }
      } finally {
        cleanupStreaming();
      }
    },
    [streamLLMResponse, cleanupStreaming, conversationId, createConversation],
  );

  // Keep ref in sync for post-conversation listen
  startConversationRef.current = startConversation;

  // --- Start listening (Web Speech API or batch fallback) ---
  const startListening = useCallback(() => {
    if (isActiveRef.current) return;

    const voiceMode = localStorage.getItem("jarvis_voice_mode") || "pipeline";
    if (voiceMode === "realtime") {
      isActiveRef.current = true;
      connectRealtimeSession();
      return;
    }
    
    lastStreamedTextRef.current = "";
    lastUserTextRef.current = "";
    
    const isFocused = document.hasFocus();
    isAppFocusedRef.current = isFocused;
    setLayoutMode(isFocused ? "centered" : "bottom-right");
    
    isActiveRef.current = true;
    setState("listening");
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantText("");

    if (isWebSpeechASRAvailable()) {
      let gotFinalResult = false;
      let latestInterimText = "";

      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          setInterimTranscript(text);
          latestInterimText = text;
        },
        onFinal: (text) => {
          gotFinalResult = true;
          if (webAsrRef.current) {
            webAsrRef.current.stop();
            webAsrRef.current = null;
          }
          isActiveRef.current = false;
          startConversation(text);
        },
        onError: (err) => {
          console.warn("[VoiceConversation] ASR error:", err);
        },
        onEnd: () => {
          if (gotFinalResult) return;
          if (latestInterimText.trim()) {
            console.log("[VoiceConversation] Silence timeout but got interim text, submitting:", latestInterimText);
            gotFinalResult = true;
            isActiveRef.current = false;
            startConversation(latestInterimText);
          } else {
            isActiveRef.current = false;
            playFarewellAndExitRef.current();
          }
        },
        silenceTimeout: 4000,
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
          playFarewellAndExitRef.current();
        }
      });
    }
  }, [transcribeWithWhisper, startConversation, connectRealtimeSession]);

  // --- Play Sci-Fi greeting and then start listening ---
  const playGreetingAndListen = useCallback(async () => {
    if (isActiveRef.current) return;

    const voiceMode = localStorage.getItem("jarvis_voice_mode") || "pipeline";
    if (voiceMode === "realtime") {
      isActiveRef.current = true;
      connectRealtimeSession();
      return;
    }
    
    lastStreamedTextRef.current = "";
    lastUserTextRef.current = "";
    
    const isFocused = document.hasFocus();
    isAppFocusedRef.current = isFocused;
    setLayoutMode(isFocused ? "centered" : "bottom-right");
    
    isActiveRef.current = true;
    setState("speaking");
    setAssistantText("我在的，主人。");
    
    try {
      // 1. Play chime sound
      playSciFiChime();
      
      // 2. Fetch spoken response
      const buffer = await jarvisClient.synthesize("我在的，主人。", voiceProfileManager.getVoiceName());
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      greetingAudioCtxRef.current = ctx;
      
      ctx.decodeAudioData(
        buffer,
        (decoded) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(ctx.destination);
          greetingSourceRef.current = source;
          
          source.onended = () => {
            greetingSourceRef.current = null;
            if (greetingAudioCtxRef.current === ctx) {
              greetingAudioCtxRef.current = null;
            }
            ctx.close().catch(() => {});
            
            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }
            
            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              if (isActiveRef.current) {
                isActiveRef.current = false;
                startListening();
              }
            }, 800);
          };
          
          source.start(0);
        },
        () => {
          isActiveRef.current = false;
          startListening();
          ctx.close().catch(() => {});
        }
      );
    } catch (err) {
      console.warn("[VoiceConversation] Greeting playback failed, falling back to direct listening:", err);
      isActiveRef.current = false;
      startListening();
    }
  }, [startListening, connectRealtimeSession]);

  // --- Stop / Barge-in ---
  const stopConversation = useCallback(() => {
    isActiveRef.current = false;
    cleanup();
    isFarewellPlayingRef.current = false;
    lastStreamedTextRef.current = "";
    setState("idle");
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantText("");
    setLastError(null);
  }, [cleanup]);

  const bargeIn = useCallback(() => {
    isFarewellPlayingRef.current = false;
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
      let latestInterimText = "";

      const asr = createWebSpeechASR({
        lang: "zh-CN",
        onInterim: (text) => {
          setInterimTranscript(text);
          latestInterimText = text;
        },
        onFinal: (text) => {
          gotFinalResult = true;
          if (webAsrRef.current) {
            webAsrRef.current.stop();
            webAsrRef.current = null;
          }
          isActiveRef.current = false;
          startConversation(text);
        },
        onEnd: () => {
          if (gotFinalResult) return;
          if (latestInterimText.trim()) {
            console.log("[VoiceConversation:BargeIn] Silence timeout but got interim text, submitting:", latestInterimText);
            gotFinalResult = true;
            isActiveRef.current = false;
            startConversation(latestInterimText);
          } else {
            isActiveRef.current = false;
            playFarewellAndExitRef.current();
          }
        },
        silenceTimeout: 4000,
      });
      webAsrRef.current = asr;
      asr.start();
    }
  }, [startConversation]);

  const playFarewellAndExit = useCallback(async () => {
    console.log("[VoiceConversation] Silence detected, playing farewell and exiting...");
    cleanup();
    
    isActiveRef.current = true;
    setState("speaking");
    setAssistantText("如果没啥事我就先退下咯，如果有需要随时喊我哦！");
    isFarewellPlayingRef.current = true;
    
    try {
      const buffer = await jarvisClient.synthesize("如果没啥事我就先退下咯，如果有需要随时喊我哦！", voiceProfileManager.getVoiceName());
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      ctx.decodeAudioData(
        buffer,
        (decoded) => {
          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.connect(ctx.destination);
          
          source.onended = () => {
            ctx.close().catch(() => {});
            
            if (breathingTimerRef.current) {
              clearTimeout(breathingTimerRef.current);
            }
            
            breathingTimerRef.current = setTimeout(() => {
              breathingTimerRef.current = null;
              if (isActiveRef.current) {
                isActiveRef.current = false;
                setState("idle");
                setAssistantText("");
              }
            }, 800);
          };
          
          source.start(0);
        },
        () => {
          ctx.close().catch(() => {});
          isActiveRef.current = false;
          setState("idle");
          setAssistantText("");
        }
      );
    } catch (err) {
      console.warn("[VoiceConversation] Farewell playback failed:", err);
      isActiveRef.current = false;
      setState("idle");
      setAssistantText("");
    }
  }, [cleanup]);

  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  useEffect(() => {
    playFarewellAndExitRef.current = playFarewellAndExit;
  }, [playFarewellAndExit]);

  // Cleanup on unmount


  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanup();
      restoreWindow();
    };
  }, [cleanup, restoreWindow]);

  // Clear persisted text when new messages arrive from server
  const clearLastStreamedText = useCallback(() => {
    lastStreamedTextRef.current = "";
    lastUserTextRef.current = "";
  }, []);

  // Display logic: show live text during streaming, keep ref text after
  const displayAssistantText =
    state === "streaming" || state === "speaking"
      ? getSpokenText(assistantText)
      : getSpokenText(lastStreamedTextRef.current || "");

  const displayUserText =
    state === "streaming" || state === "speaking" || state === "listening"
      ? finalTranscript
      : lastUserTextRef.current || "";

  return {
    state,
    interimTranscript,
    finalTranscript: displayUserText,
    assistantText: displayAssistantText,
    lastError,
    isSupported,
    startListening,
    playGreetingAndListen,
    stopConversation,
    bargeIn,
    startConversation,
    clearLastStreamedText,
    layoutMode,
  };
}
