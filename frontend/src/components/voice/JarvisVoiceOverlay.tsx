import { useEffect, useRef, useState } from "react";
import { X, Mic, Square, Loader2, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceConversationState } from "@/hooks/useVoiceConversation";

interface JarvisVoiceOverlayProps {
  state: VoiceConversationState;
  interimTranscript: string;
  finalTranscript: string;
  assistantText: string;
  onClose: () => void;
  onStop: () => void;
  onOpenSettings?: () => void;
  layoutMode?: "centered" | "bottom-right";
}

export function JarvisVoiceOverlay({
  state,
  interimTranscript,
  finalTranscript,
  assistantText,
  onClose,
  onStop,
  onOpenSettings,
  layoutMode = "centered",
}: JarvisVoiceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

  // Active Timer state
  const [timer, setTimer] = useState<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start stopwatch when ASR listening or AI speaking is active
  useEffect(() => {
    const isActive = state === "listening" || state === "speaking" || state === "streaming";
    
    if (isActive) {
      setTimer(0);
      timerIntervalRef.current = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [state]);

  // Format timer as MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Canvas Sci-Fi Sine Wave Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas properly for high-DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Color definitions based on state
    const getStateColors = () => {
      switch (state) {
        case "listening":
          return {
            primary: "rgba(6, 182, 212, 0.8)", // Cyan
            secondary: "rgba(16, 185, 129, 0.4)", // Emerald
            glow: "rgba(6, 182, 212, 0.25)",
            speed: 0.15,
            amplitude: layoutMode === "centered" ? 45 : 35,
            waves: 4,
          };
        case "transcribing":
          return {
            primary: "rgba(59, 130, 246, 0.8)", // Blue
            secondary: "rgba(99, 102, 241, 0.4)", // Indigo
            glow: "rgba(59, 130, 246, 0.25)",
            speed: 0.25,
            amplitude: 20,
            waves: 6,
          };
        case "streaming":
          return {
            primary: "rgba(245, 158, 11, 0.8)", // Amber
            secondary: "rgba(234, 179, 8, 0.4)", // Yellow
            glow: "rgba(245, 158, 11, 0.25)",
            speed: 0.08,
            amplitude: 30,
            waves: 3,
          };
        case "speaking":
          return {
            primary: "rgba(139, 92, 246, 0.8)", // Violet
            secondary: "rgba(236, 72, 153, 0.4)", // Pink
            glow: "rgba(139, 92, 246, 0.25)",
            speed: 0.12,
            amplitude: layoutMode === "centered" ? 35 : 28,
            waves: 5,
          };
        case "error":
          return {
            primary: "rgba(239, 68, 68, 0.85)", // Vibrant Red
            secondary: "rgba(239, 68, 68, 0.3)", // Soft Red
            glow: "rgba(239, 68, 68, 0.2)",
            speed: 0.04,
            amplitude: 8,
            waves: 3,
          };
        default:
          return {
            primary: "rgba(148, 163, 184, 0.5)", // Slate
            secondary: "rgba(71, 85, 105, 0.2)",
            glow: "rgba(148, 163, 184, 0.1)",
            speed: 0.05,
            amplitude: 10,
            waves: 2,
          };
      }
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      
      ctx.clearRect(0, 0, w, h);
      
      const config = getStateColors();
      phaseRef.current += config.speed;
      
      // Draw background glow grid lines for futuristic HUD look
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw multi-layered sine waves
      for (let i = 0; i < config.waves; i++) {
        ctx.beginPath();
        
        const currentAmp = config.amplitude * (1 - i * 0.18);
        const currentFreq = 0.008 + i * 0.003;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = config.primary;
        ctx.strokeStyle = i === 0 ? config.primary : config.secondary;
        ctx.lineWidth = i === 0 ? 3 : 1.5;
        
        // Fluid sine formula
        for (let x = 0; x < w; x++) {
          const edgeFade = Math.sin((x / w) * Math.PI);
          const y = h / 2 + Math.sin(x * currentFreq + phaseRef.current + i * 1.5) * currentAmp * edgeFade;
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    const animationId = requestAnimationFrame(draw);
    animationFrameRef.current = animationId;

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, layoutMode]);

  if (state === "idle") return null;

  // Custom styling based on state
  const glowColors: Record<VoiceConversationState, string> = {
    idle: "shadow-slate-500/40 border-slate-700/50 bg-[#0B0F19]/95 text-white",
    listening: "shadow-cyan-500/40 border-cyan-500/40 bg-[#091E2A]/95 text-white",
    transcribing: "shadow-blue-500/40 border-blue-500/40 bg-[#0A1A30]/95 text-white",
    streaming: "shadow-amber-500/40 border-amber-500/40 bg-[#251A0A]/95 text-white",
    speaking: "shadow-violet-500/40 border-violet-500/40 bg-[#1D0E2E]/95 text-white",
    error: "shadow-red-500/40 border-red-500/40 bg-[#2C0B0B]/95 text-white",
  };

  const stateTitle: Record<VoiceConversationState, string> = {
    idle: "IDLE",
    listening: "🎤 JARVIS IS LISTENING...",
    transcribing: "🔄 TRANSCRIBING...",
    streaming: "⏳ DEEP THOUGHT GENERATING...",
    speaking: "🔊 JARVIS COMMUNICATING...",
    error: "⚠️ CRITICAL PIPELINE ERROR",
  };

  const stateSubtitle: Record<VoiceConversationState, string> = {
    idle: "Waiting",
    listening: "Speak your command clearly",
    transcribing: "Converting speech to digital instructions",
    streaming: "Synthesizing intelligence feedback",
    speaking: "Streaming audio response segment",
    error: "Voice pipeline encountered an error",
  };

  const isCentered = layoutMode === "centered";

  return (
    <div
      className={cn(
        isCentered
          ? "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px] transition-all duration-300 animate-in fade-in"
          : "fixed inset-0 z-50 w-full h-full flex items-center justify-center bg-transparent transition-all duration-300 animate-in fade-in"
      )}
    >
      <div
        className={cn(
          isCentered
            ? "relative w-full max-w-md p-6 mx-4 rounded-2xl border backdrop-blur-2xl shadow-2xl transition-all duration-500 transform scale-100 animate-in zoom-in-95"
            : "relative w-full h-full p-4 flex flex-col border rounded-2xl backdrop-blur-2xl shadow-2xl transition-all duration-500 transform scale-100",
          glowColors[state]
        )}
      >
        {/* Glow overlay grid effect */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/10 pointer-events-none rounded-2xl" />

        {/* HUD top decorative bar */}
        <div className={cn("flex items-center justify-between border-b border-white/10 pb-2", isCentered ? "mb-4" : "mb-3")}>
          <div className="flex items-center gap-2">
            <span className={cn(
              "h-2 w-2 rounded-full animate-ping",
              state === "error" ? "bg-red-500" : "bg-cyan-500"
            )} />
            <span className={cn(
              "font-mono text-[10px] tracking-widest font-bold uppercase",
              state === "error" ? "text-red-400" : "text-cyan-400"
            )}>
              {state === "error" ? "SYSTEM ERROR DETECTED" : (isCentered ? "JARVIS HUD v2.5" : "JARVIS HUD")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Timer stopwatch */}
            {(state === "listening" || state === "speaking" || state === "streaming") && (
              <span className="font-mono text-[10px] tracking-wider bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-cyan-400 font-bold animate-pulse">
                ⏱️ {formatTime(timer)}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-5 w-5 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content body */}
        <div className={cn(isCentered ? "space-y-6" : "flex-1 flex flex-col justify-between overflow-hidden mt-3 min-h-0")}>
          {/* Main Visualizer Area */}
          <div
            className={cn(
              "relative rounded-xl border border-white/5 bg-black/40 overflow-hidden flex flex-col items-center justify-center flex-shrink-0",
              isCentered ? "h-36" : "h-28"
            )}
          >
            {/* Pulsating background circle */}
            <div
              className={cn(
                "absolute rounded-full border border-white/5 opacity-20 filter blur-sm transition-all duration-1000 transform scale-100",
                isCentered ? "h-30 w-30" : "h-24 w-24",
                state === "listening" && "scale-110 border-cyan-500 animate-pulse",
                state === "speaking" && "scale-120 border-violet-500",
                state === "streaming" && "scale-105 border-amber-500 animate-spin"
              )}
            />

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            
            {/* Floating state overlay label */}
            <div className="absolute bottom-2 text-center pointer-events-none">
              <p className="font-mono text-[10px] tracking-wider text-white/90 font-bold drop-shadow-md">
                {stateTitle[state]}
              </p>
              <p className="text-[10px] text-white/50 font-mono tracking-wide drop-shadow mt-0.5">
                {stateSubtitle[state]}
              </p>
            </div>
          </div>

          {/* Interactive Transcript Panel */}
          <div className={cn("space-y-3", !isCentered ? "flex-1 overflow-y-auto min-h-0 py-2 pr-1" : "")}>
            {/* User speech transcript bubble */}
            {(state === "listening" || finalTranscript) && (
              <div className="rounded-lg border border-white/10 bg-white/10 p-2.5 space-y-1">
                <p className="font-mono text-[9px] text-cyan-400 uppercase tracking-widest font-semibold">
                  Host Voice Command:
                </p>
                <div className="text-xs min-h-[1.2rem] max-h-16 overflow-y-auto leading-relaxed">
                  {interimTranscript ? (
                    <span className="text-white/80 animate-pulse">{interimTranscript}</span>
                  ) : finalTranscript ? (
                    <span className="text-white font-medium">{finalTranscript}</span>
                  ) : (
                    <span className="text-white/30 italic font-mono">Listening for voice feed...</span>
                  )}
                </div>
              </div>
            )}

            {/* Holographic Thought Ticker */}
            {(state === "streaming" || state === "transcribing" || state === "error") && !assistantText && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5 animate-pulse">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[9px] text-amber-400 uppercase tracking-widest font-bold">
                    🧠 COGNITIVE MATRIX SCANNERS:
                  </p>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                </div>
                <div className="font-mono text-[10px] text-amber-300/80 space-y-0.5">
                  <p className="animate-pulse">▶ [RETRIEVING KNOWLEDGE SCHEMAS...]</p>
                  <p className="text-[9px] text-amber-500/60 pl-3">DECRYPTING NEURAL NODES: OK</p>
                  <p className="text-[9px] text-amber-500/60 pl-3">SEMANTIC RESPONSE CORRELATION: SYNTHESIZING</p>
                </div>
              </div>
            )}

            {/* AI speaking response bubble */}
            {assistantText && (
              <div className={cn(
                "rounded-lg p-2.5 space-y-1 border transition-all duration-300",
                state === "error"
                  ? "border-red-500/30 bg-red-500/10 shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]"
                  : "border-purple-500/25 bg-purple-500/10"
              )}>
                <p className={cn(
                  "font-mono text-[9px] uppercase tracking-widest font-semibold",
                  state === "error" ? "text-red-400" : "text-purple-400"
                )}>
                  {state === "error" ? "⚠️ SYSTEM ALIGNMENT FAILURE:" : "Jarvis Response:"}
                </p>
                <div className={cn(
                  "text-xs max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed font-medium transition-colors",
                  state === "error" ? "text-red-300/90" : "text-white/90"
                )}>
                  {assistantText}
                </div>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="flex justify-center border-t border-white/10 pt-3 gap-3 flex-shrink-0">
            {state === "error" ? (
              // Error state: show actionable buttons
              <>
                {onOpenSettings && (
                  <Button
                    onClick={() => { onClose(); onOpenSettings(); }}
                    className="flex items-center gap-1.5 rounded-full px-4 py-2 bg-red-600/80 hover:bg-red-600 border border-red-500/30 font-mono text-[10px] tracking-wider shadow-lg shadow-red-900/30 transition-all"
                  >
                    <Settings2 className="h-3 w-3" /> 前往配置 API Key
                  </Button>
                )}
                <Button
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-mono text-[10px] tracking-wider transition-all"
                >
                  <XCircle className="h-3 w-3" /> 关闭
                </Button>
              </>
            ) : state === "speaking" || state === "streaming" ? (
              <Button
                variant="destructive"
                onClick={onStop}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 bg-red-600 hover:bg-red-700 font-mono text-[10px] tracking-wider shadow-lg shadow-red-900/30"
              >
                <Square className="h-3 w-3" /> INTERRUPT
              </Button>
            ) : state === "listening" ? (
              <Button
                onClick={onStop}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 font-mono text-[10px] tracking-wider shadow-lg shadow-cyan-900/30"
              >
                <Mic className="h-3 w-3 animate-pulse" /> FINISH COMM
              </Button>
            ) : (
              <Button
                disabled
                className="flex items-center gap-1.5 rounded-full px-4 py-2 bg-white/10 text-white/40 border border-white/5 font-mono text-[10px] tracking-wider"
              >
                <Loader2 className="h-3 w-3 animate-spin" /> SYNCHRONIZING
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
