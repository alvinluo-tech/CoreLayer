import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { Mic, Volume2, Radio, User, Sparkles } from "lucide-react";
import { voiceProfileManager } from "@/lib/voiceProfile";
import { getVoiceStatus, type VoiceStatus } from "@/lib/tauri";

export function VoicePage() {
  const profile = voiceProfileManager.getActiveProfile();
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [voiceMode, setVoiceMode] = useState<"pipeline" | "realtime">(
    () => (localStorage.getItem("jarvis_voice_mode") as "pipeline" | "realtime") || "pipeline"
  );

  useEffect(() => {
    getVoiceStatus().then(setVoiceStatus).catch(() => {});
  }, []);

  const handleVoiceModeChange = (mode: "pipeline" | "realtime") => {
    setVoiceMode(mode);
    localStorage.setItem("jarvis_voice_mode", mode);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">语音系统</h2>
          <p className="text-sm text-muted-foreground">语音配置与实时模式选择</p>
        </div>
      </div>

      {/* Voice Protocol Card */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          语音接入协议与模式 (Voice Mode)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pipeline Card */}
          <button
            onClick={() => handleVoiceModeChange("pipeline")}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              voiceMode === "pipeline"
                ? "border-primary bg-primary/[0.03] font-semibold"
                : "border-border/60 bg-background/50 hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Mic className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold">标准串联协议 (Standard ASR + TTS)</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              分步式处理：本地/网页 ASR 录音识别 $\rightarrow$ REST 大模型 $\rightarrow$ 语音合成播放。支持所有提供商（如 DeepSeek，Kimi 等），适合常规对话，延迟 1.5s - 2.5s。
            </p>
          </button>

          {/* Realtime Card */}
          <button
            onClick={() => handleVoiceModeChange("realtime")}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              voiceMode === "realtime"
                ? "border-primary bg-primary/[0.03] font-semibold"
                : "border-border/60 bg-background/50 hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Radio className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold">ChatGPT Realtime 极速双向流</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              极速直连：基于 WebRTC/WebSocket 建立双向持续音频流，零碎文本拆分与 TTS 延迟消失，支持随时人声打断，延迟 0.2s - 0.5s（仅限已接入 OpenAI Realtime 兼容大模型）。
            </p>
          </button>
        </div>
      </Card>

      {/* Voice Profile Card */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          语音配置
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">名称</p>
            <p className="text-sm font-medium mt-0.5">{profile.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">语言</p>
            <p className="text-sm mt-0.5">{profile.language}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">模型</p>
            <p className="text-sm font-mono mt-0.5">{profile.model}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">性别</p>
            <p className="text-sm mt-0.5">
              {profile.gender === "female" ? "女" : profile.gender === "male" ? "男" : "中性"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">风格</p>
            <p className="text-sm mt-0.5">{profile.style}</p>
          </div>
        </div>
      </Card>

      {/* Voice System Status */}
      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          系统状态
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">ASR (语音识别)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.asr ? "healthy" : "error"}
              label={voiceStatus?.asr ? "可用" : "不可用"}
            />
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">TTS (语音合成)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.tts?.available ? "healthy" : "error"}
              label={
                voiceStatus?.tts?.available
                  ? `${voiceStatus.tts.provider}`
                  : "不可用"
              }
            />
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">VAD (语音活动检测)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.vad?.available ? "healthy" : "warning"}
              label={voiceStatus?.vad?.available ? "可用" : voiceStatus?.vad?.note ?? "未知"}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
