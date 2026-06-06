import { ConversationList } from '@/components/chat/ConversationList';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { TodayView } from '@/components/modules/todo/TodayView';
import { ReadingList } from '@/components/modules/reading/ReadingList';
import { DailySummary } from '@/components/modules/review/DailySummary';
import { VoicePanel } from '@/components/voice/VoicePanel';
import { Separator } from '@/components/ui/separator';
import type { Message } from '@/hooks/useChat';
import type { VoiceState as WakeWordVoiceState } from '@/hooks/useVoice';
import type { VoiceState as FSMVoiceState } from '@/hooks/useVoiceFSM';

type CombinedVoiceState = WakeWordVoiceState | FSMVoiceState;

interface VoicePanelState {
  state: CombinedVoiceState;
  transcript: string;
  isSupported: boolean;
  isWakeWordListening: boolean;
  wakeWordMethod: 'porcupine' | 'webspeech' | null;
  wakeWordError: string | null;
  interimTranscript: string;
  assistantText: string;
  onToggle: () => void;
  onBargeIn: () => void;
  onStop: () => void;
}

interface AssistantViewProps {
  messages: Message[];
  onSend: (text: string) => void;
  isLoading: boolean;
  hasActiveConversation: boolean;
  error: string | null;
  conversationId: string | null;
  voiceUserText?: string;
  voiceAssistantText?: string;
  isVoiceStreaming: boolean;
  voice: VoicePanelState;
}

/**
 * Assistant view — the default chat experience.
 * Left sidebar with conversation list + voice + modules, main area with chat.
 */
export function AssistantView({
  messages,
  onSend,
  isLoading,
  hasActiveConversation,
  error,
  conversationId,
  voiceUserText,
  voiceAssistantText,
  isVoiceStreaming,
  voice,
}: AssistantViewProps) {
  return (
    <>
      {/* Left sidebar — glass panel */}
      <aside
        className="w-[260px] flex flex-col overflow-hidden"
        style={{
          background: 'rgba(4,6,14,0.6)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid var(--glass-border)',
        }}
      >
        {/* Sidebar header */}
        <div
          className="px-4 py-3 relative"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div
            className="absolute bottom-0 left-3.5 right-3.5 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--cyan-glow), transparent)',
            }}
          />
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <ConversationList />

          <Separator variant="gradient" />

          <VoicePanel
            state={voice.state}
            transcript={voice.transcript}
            isSupported={voice.isSupported}
            isWakeWordListening={voice.isWakeWordListening}
            wakeWordMethod={voice.wakeWordMethod}
            wakeWordError={voice.wakeWordError}
            interimTranscript={voice.interimTranscript}
            assistantText={voice.assistantText}
            onToggle={voice.onToggle}
            onBargeIn={voice.onBargeIn}
            onStop={voice.onStop}
          />

          <Separator variant="gradient" />

          <TodayView />
          <ReadingList />
          <DailySummary />
        </div>
      </aside>

      {/* Main area — Chat */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <ChatPanel
          messages={messages}
          onSend={onSend}
          isLoading={isLoading}
          hasActiveConversation={hasActiveConversation}
          error={error}
          conversationId={conversationId}
          voiceUserText={voiceUserText}
          voiceAssistantText={voiceAssistantText}
          isVoiceStreaming={isVoiceStreaming}
        />
      </main>
    </>
  );
}
