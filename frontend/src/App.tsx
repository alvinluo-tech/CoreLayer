import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import { TodayView } from "@/components/modules/todo/TodayView";
import { ReadingList } from "@/components/modules/reading/ReadingList";
import { DailySummary } from "@/components/modules/review/DailySummary";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { useConversationStore } from "@/stores/conversationStore";
import { usePaletteStore } from "@/stores/paletteStore";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

function App() {
  const { messages, sendMessage, isLoading, activeConversationId, error, startNewChat } = useChat();
  const [showSettings, setShowSettings] = useState(false);
  const paletteToggle = usePaletteStore((s) => s.toggle);

  // Global keyboard shortcut: Alt+Space to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        paletteToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paletteToggle]);

  // Ref for voice hook (to avoid circular dependency)
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);

  // When conversation ends, restart wake word listening
  const handleConversationIdle = useCallback(() => {
    const v = voiceRef.current;
    if (v && !v.isWakeWordListening) {
      v.toggleListening();
    }
  }, []);

  // Streaming voice conversation (primary)
  const voiceConv = useVoiceConversation(
    activeConversationId,
    handleConversationIdle,
    startNewChat,
  );

  // Wake word detection (from useVoice)
  const handleWake = useCallback(() => {
    voiceConv.startListening();
  }, [voiceConv]);

  // When batch ASR transcription completes, start streaming conversation
  const handleVoiceCommand = useCallback(
    (text: string) => {
      voiceConv.startConversation(text);
    },
    [voiceConv],
  );

  const voice = useVoice(handleVoiceCommand, handleWake);
  voiceRef.current = voice;

  // Voice toggle: if conversation active, stop it; otherwise toggle wake word
  const handleVoiceToggle = useCallback(() => {
    if (voiceConv.state !== "idle") {
      voiceConv.stopConversation();
      // onIdle will restart wake word automatically
    } else {
      voice.toggleListening();
    }
  }, [voiceConv, voice]);

  const handlePaletteChat = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handlePaletteNavigate = useCallback((view: string) => {
    if (view === "new-chat") {
      // Will be handled by conversation store
    }
  }, []);

  // Refresh store messages from server after voice conversation ends
  const refreshMessages = useConversationStore((s) => s.refreshMessages);
  useEffect(() => {
    if (voiceConv.state === "idle" || voiceConv.state === "listening") {
      refreshMessages();
    }
  }, [voiceConv.state, refreshMessages]);

  // Clear streamed voice text when persisted messages arrive from server
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      voiceConv.clearLastStreamedText();
    }
  }, [messages, voiceConv.clearLastStreamedText]);

  // Determine which state to show in VoicePanel
  const panelState = voiceConv.state !== "idle" ? voiceConv.state : voice.state;
  const panelTranscript =
    voiceConv.state !== "idle" ? voiceConv.finalTranscript : voice.transcript;
  const panelSupported = voiceConv.isSupported || voice.isSupported;

  return (
    <div className="flex h-screen bg-background">
      {/* Left sidebar */}
      <aside className="w-80 border-r border-border flex flex-col overflow-hidden">
        <header className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Jarvis</h1>
            <p className="text-sm text-muted-foreground">Personal Command Center</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="h-8 w-8"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Conversation list */}
          <ConversationList />

          <Separator />

          {/* Voice control */}
          <VoicePanel
            state={panelState}
            transcript={panelTranscript}
            isSupported={panelSupported}
            isWakeWordListening={voice.isWakeWordListening}
            wakeWordMethod={voice.wakeWordMethod}
            wakeWordError={voice.wakeWordError}
            interimTranscript={voiceConv.interimTranscript}
            assistantText={voiceConv.assistantText}
            onToggle={handleVoiceToggle}
            onBargeIn={voiceConv.bargeIn}
            onStop={voiceConv.stopConversation}
          />

          <Separator />

          {/* Module views */}
          <TodayView />
          <ReadingList />
          <DailySummary />
        </div>
      </aside>

      {/* Main area - Chat */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatPanel
          messages={messages}
          onSend={sendMessage}
          isLoading={isLoading}
          hasActiveConversation={!!activeConversationId}
          error={error}
          conversationId={activeConversationId}
          voiceUserText={voiceConv.finalTranscript || undefined}
          voiceAssistantText={voiceConv.assistantText}
          isVoiceStreaming={voiceConv.state === "streaming"}
        />
      </main>

      {/* Command Palette (Alt+Space) */}
      <CommandPalette
        onChat={handlePaletteChat}
        onNavigate={handlePaletteNavigate}
        onVoiceToggle={handleVoiceToggle}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default App;
