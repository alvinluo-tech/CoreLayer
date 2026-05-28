import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceState } from "@/hooks/useVoice";

interface VoicePanelProps {
  state: VoiceState;
  transcript: string;
  isSupported: boolean;
  onToggle: () => void;
}

const stateLabels: Record<VoiceState, string> = {
  idle: "点击开始语音",
  recording: "正在聆听...",
  transcribing: "识别中...",
  processing: "处理中...",
  speaking: "播报中...",
};

const stateColors: Record<VoiceState, string> = {
  idle: "bg-secondary",
  recording: "bg-green-500/20 border-green-500",
  transcribing: "bg-blue-500/20 border-blue-500",
  processing: "bg-yellow-500/20 border-yellow-500",
  speaking: "bg-purple-500/20 border-purple-500",
};

export function VoicePanel({ state, transcript, isSupported, onToggle }: VoicePanelProps) {
  if (!isSupported) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        需要麦克风权限才能使用语音
      </div>
    );
  }

  const isActive = state !== "idle";

  return (
    <div className="space-y-3">
      {/* Voice button */}
      <div className="flex items-center gap-3">
        <Button
          variant={isActive ? "default" : "outline"}
          size="icon"
          onClick={onToggle}
          className={cn(
            "h-10 w-10 rounded-full transition-all",
            isActive && "animate-pulse",
            state === "recording" && "bg-green-600 hover:bg-green-700",
            state === "transcribing" && "bg-blue-600 hover:bg-blue-700",
            state === "speaking" && "bg-purple-600 hover:bg-purple-700",
          )}
        >
          {state === "transcribing" || state === "processing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isActive ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{stateLabels[state]}</p>
          {transcript && (
            <p className="text-sm truncate mt-0.5">{transcript}</p>
          )}
        </div>

        {state === "speaking" && (
          <Volume2 className="h-4 w-4 text-purple-500 animate-pulse" />
        )}
      </div>

      {/* Hint */}
      {!isActive && (
        <div className="rounded-md border p-2 text-xs bg-secondary">
          <p className="text-muted-foreground">
            点击麦克风开始语音，说完自动识别（Groq Whisper + MiMo TTS）
          </p>
        </div>
      )}

      {/* Active state indicator */}
      {isActive && (
        <div className={cn("rounded-md border p-2 text-xs", stateColors[state])}>
          {state === "recording" && (
            <p className="text-green-400">🎤 正在录音... 说完会自动停止</p>
          )}
          {state === "transcribing" && (
            <p className="text-blue-400">🔄 语音识别中 (Whisper)...</p>
          )}
          {state === "processing" && (
            <p className="text-yellow-400">⏳ 正在处理你的请求...</p>
          )}
          {state === "speaking" && (
            <p className="text-purple-400">🔊 Jarvis 正在回复... (点击可打断)</p>
          )}
        </div>
      )}
    </div>
  );
}
