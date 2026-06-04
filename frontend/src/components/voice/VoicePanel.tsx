import { Mic, MicOff, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceState as WakeWordVoiceState } from '@/hooks/useVoice';
import type { VoiceState } from '@/hooks/useVoiceFSM';

type CombinedState = WakeWordVoiceState | VoiceState;

interface VoicePanelProps {
  state: CombinedState;
  transcript: string;
  isSupported: boolean;
  isWakeWordListening?: boolean;
  wakeWordMethod?: 'porcupine' | 'webspeech' | null;
  wakeWordError?: string | null;
  interimTranscript?: string;
  assistantText?: string;
  onToggle: () => void;
  onBargeIn?: () => void;
  onStop?: () => void;
}

const stateLabels: Record<CombinedState, string> = {
  idle: '点击开始语音',
  listening: '正在聆听...',
  recording: '正在聆听...',
  transcribing: '识别中...',
  streaming: 'AI 思考中...',
  processing: '处理中...',
  speaking: '播报中...',
  error: '出错了',
};

const stateColors: Record<CombinedState, string> = {
  idle: 'bg-secondary',
  listening: 'bg-green-500/20 border-green-500',
  recording: 'bg-green-500/20 border-green-500',
  transcribing: 'bg-blue-500/20 border-blue-500',
  streaming: 'bg-yellow-500/20 border-yellow-500',
  processing: 'bg-yellow-500/20 border-yellow-500',
  speaking: 'bg-purple-500/20 border-purple-500',
  error: 'bg-red-500/20 border-red-500',
};

export function VoicePanel({
  state,
  transcript,
  isSupported,
  isWakeWordListening,
  wakeWordMethod,
  wakeWordError,
  interimTranscript,
  assistantText,
  onToggle,
  onBargeIn,
  onStop,
}: VoicePanelProps) {
  if (!isSupported) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        需要麦克风权限才能使用语音
      </div>
    );
  }

  const isActive = state !== 'idle';
  const canBargeIn = state === 'speaking' || state === 'streaming';

  return (
    <div className="space-y-3">
      {/* Voice button */}
      <div className="flex items-center gap-3">
        <Button
          variant={isActive || isWakeWordListening ? 'default' : 'outline'}
          size="icon"
          onClick={canBargeIn && onBargeIn ? onBargeIn : onToggle}
          className={cn(
            'h-10 w-10 rounded-full transition-all',
            isActive && 'animate-pulse',
            isWakeWordListening && !isActive && 'bg-green-600 hover:bg-green-700',
            (state === 'recording' || state === 'listening') && 'bg-green-600 hover:bg-green-700',
            state === 'transcribing' && 'bg-blue-600 hover:bg-blue-700',
            state === 'streaming' && 'bg-yellow-600 hover:bg-yellow-700',
            state === 'speaking' && 'bg-purple-600 hover:bg-purple-700'
          )}
        >
          {state === 'transcribing' || state === 'processing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : canBargeIn ? (
            <Square className="h-4 w-4" />
          ) : isActive || isWakeWordListening ? (
            <Mic className="h-4 w-4" />
          ) : (
            <MicOff className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {isWakeWordListening && !isActive ? '说 "Hey Jarvis" 唤醒' : stateLabels[state]}
          </p>
          {transcript && <p className="text-sm truncate mt-0.5">{transcript}</p>}
        </div>

        {state === 'speaking' && onStop && (
          <Button variant="ghost" size="icon" onClick={onStop} className="h-6 w-6">
            <Square className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Wake word error */}
      {wakeWordError && (
        <div className="rounded-md border p-2 text-xs bg-destructive/10 text-destructive">
          唤醒词错误: {wakeWordError}
        </div>
      )}

      {/* Hint */}
      {!isActive && !isWakeWordListening && (
        <div className="rounded-md border p-2 text-xs bg-secondary">
          <p className="text-muted-foreground">点击麦克风开启唤醒词模式（"Hey Jarvis"）</p>
        </div>
      )}

      {/* Wake word active hint */}
      {isWakeWordListening && !isActive && (
        <div className="rounded-md border p-2 text-xs bg-green-500/10 border-green-500/30">
          <p className="text-green-400">
            🎙️ 等待唤醒... 说 "Hey Jarvis" 开始对话
            {wakeWordMethod && (
              <span className="text-muted-foreground ml-1">({wakeWordMethod})</span>
            )}
          </p>
        </div>
      )}

      {/* Active state indicator */}
      {isActive && (
        <div className={cn('rounded-md border p-2 text-xs', stateColors[state])}>
          {(state === 'recording' || state === 'listening') && (
            <div>
              <p className="text-green-400">🎤 正在聆听...</p>
              {interimTranscript && (
                <p className="text-green-300/70 mt-1 truncate">{interimTranscript}</p>
              )}
            </div>
          )}
          {state === 'transcribing' && <p className="text-blue-400">🔄 语音识别中...</p>}
          {(state === 'streaming' || state === 'processing') && (
            <div>
              <p className="text-yellow-400">⏳ AI 思考中...</p>
              {assistantText && (
                <p className="text-yellow-300/70 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {assistantText}
                </p>
              )}
            </div>
          )}
          {state === 'speaking' && (
            <div>
              <p className="text-purple-400">🔊 Jarvis 正在回复... (点击打断)</p>
              {assistantText && (
                <p className="text-purple-300/70 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {assistantText}
                </p>
              )}
            </div>
          )}
          {state === 'error' && <p className="text-red-400">❌ 出错了，请重试</p>}
        </div>
      )}
    </div>
  );
}
