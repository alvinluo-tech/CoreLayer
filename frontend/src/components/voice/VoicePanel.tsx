import { Mic, MicOff, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const stateStyles: Record<CombinedState, { color: string; bg: string; border: string }> = {
  idle: { color: 'var(--text-tertiary)', bg: 'var(--glass-bg)', border: 'var(--glass-border)' },
  listening: {
    color: 'var(--emerald)',
    bg: 'rgba(0,230,138,0.06)',
    border: 'rgba(0,230,138,0.15)',
  },
  recording: {
    color: 'var(--emerald)',
    bg: 'rgba(0,230,138,0.06)',
    border: 'rgba(0,230,138,0.15)',
  },
  transcribing: {
    color: 'var(--blue)',
    bg: 'rgba(61,122,255,0.06)',
    border: 'rgba(61,122,255,0.15)',
  },
  streaming: { color: 'var(--amber)', bg: 'rgba(255,184,0,0.06)', border: 'rgba(255,184,0,0.15)' },
  processing: { color: 'var(--amber)', bg: 'rgba(255,184,0,0.06)', border: 'rgba(255,184,0,0.15)' },
  speaking: {
    color: 'var(--violet)',
    bg: 'rgba(167,139,250,0.06)',
    border: 'rgba(167,139,250,0.15)',
  },
  error: { color: 'var(--rose)', bg: 'rgba(255,61,90,0.06)', border: 'rgba(255,61,90,0.15)' },
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
      <p
        className="text-center py-2"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: 0.5,
        }}
      >
        需要麦克风权限才能使用语音
      </p>
    );
  }

  const isActive = state !== 'idle';
  const canBargeIn = state === 'speaking' || state === 'streaming';
  const style = stateStyles[state];

  const getMicButtonStyle = () => {
    if (canBargeIn) {
      return { background: 'var(--rose)', border: '1px solid rgba(255,61,90,0.3)', color: '#fff' };
    }
    if (isActive || isWakeWordListening) {
      return { background: style.color, border: `1px solid ${style.border}`, color: '#fff' };
    }
    return {
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      color: 'var(--text-secondary)',
    };
  };

  return (
    <div className="space-y-3">
      {/* Voice button + label */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={canBargeIn && onBargeIn ? onBargeIn : onToggle}
          className="h-10 w-10 rounded-full transition-all shrink-0"
          style={getMicButtonStyle()}
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
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
            }}
          >
            {isWakeWordListening && !isActive ? '说 "Hey Jarvis" 唤醒' : stateLabels[state]}
          </p>
          {transcript && (
            <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {transcript}
            </p>
          )}
        </div>

        {state === 'speaking' && onStop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onStop}
            className="h-6 w-6 shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Square className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Wake word error */}
      {wakeWordError && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{
            background: 'rgba(255,61,90,0.06)',
            border: '1px solid rgba(255,61,90,0.15)',
            color: 'var(--rose)',
          }}
        >
          唤醒词错误: {wakeWordError}
        </div>
      )}

      {/* Hint */}
      {!isActive && !isWakeWordListening && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-tertiary)',
          }}
        >
          点击麦克风开启唤醒词模式（"Hey Jarvis"）
        </div>
      )}

      {/* Wake word active hint */}
      {isWakeWordListening && !isActive && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{
            background: 'rgba(0,230,138,0.06)',
            border: '1px solid rgba(0,230,138,0.15)',
            color: 'var(--emerald)',
          }}
        >
          等待唤醒... 说 "Hey Jarvis" 开始对话
          {wakeWordMethod && (
            <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>
              ({wakeWordMethod})
            </span>
          )}
        </div>
      )}

      {/* Active state indicator */}
      {isActive && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            color: style.color,
          }}
        >
          {(state === 'recording' || state === 'listening') && (
            <div>
              <p>正在聆听...</p>
              {interimTranscript && (
                <p className="mt-1 truncate" style={{ opacity: 0.7 }}>
                  {interimTranscript}
                </p>
              )}
            </div>
          )}
          {state === 'transcribing' && <p>语音识别中...</p>}
          {(state === 'streaming' || state === 'processing') && (
            <div>
              <p>AI 思考中...</p>
              {assistantText && (
                <p
                  className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap"
                  style={{ opacity: 0.7 }}
                >
                  {assistantText}
                </p>
              )}
            </div>
          )}
          {state === 'speaking' && (
            <div>
              <p>Jarvis 正在回复... (点击打断)</p>
              {assistantText && (
                <p
                  className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap"
                  style={{ opacity: 0.7 }}
                >
                  {assistantText}
                </p>
              )}
            </div>
          )}
          {state === 'error' && <p>出错了，请重试</p>}
        </div>
      )}
    </div>
  );
}
