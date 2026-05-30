import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import { TodayView } from "@/components/modules/todo/TodayView";
import { ReadingList } from "@/components/modules/reading/ReadingList";
import { DailySummary } from "@/components/modules/review/DailySummary";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { JarvisVoiceOverlay } from "@/components/voice/JarvisVoiceOverlay";
import { ControlCenter } from "@/components/control-center/ControlCenter";
import type { ControlPage } from "@/components/control-center/ControlCenter";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { useVoiceConversation } from "@/hooks/useVoiceConversation";
import { useConversationStore } from "@/stores/conversationStore";
import { usePaletteStore } from "@/stores/paletteStore";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { TitleBar } from "@/components/layout/TitleBar";

const isAssistantWindow = typeof window !== "undefined" && window.location.search.includes("assistant=true");

function App() {
  // If this is the assistant floating window, run in a super-lightweight standalone mode!
  if (isAssistantWindow) {
    const handleAssistantIdle = useCallback(async () => {
      console.log("[Assistant Window] Hiding window due to idle state");
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.hide().catch(() => {});
        // Notify the main window that we are idle!
        await appWindow.emit("assistant-idle").catch(() => {});
      } catch (e) {
        console.warn("Failed to hide assistant window:", e);
      }
    }, []);

    const voiceConv = useVoiceConversation(
      null, // Start fresh
      handleAssistantIdle,
      async () => { return { id: "" }; }
    );

    // Ensure the document background is fully transparent so Tauri window transparency works
    useEffect(() => {
      if (typeof document !== "undefined") {
        document.body.style.backgroundColor = "transparent";
        document.documentElement.style.backgroundColor = "transparent";
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
      }
    }, []);

    useEffect(() => {
      let unlisten: (() => void) | null = null;
      
      const setupListener = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          
          const unsub = await appWindow.listen<{ isHandoff?: boolean }>("wake-assistant", (event) => {
            console.log("[Assistant Window] Received wake event, payload:", event.payload);
            if (event.payload?.isHandoff) {
              console.log("[Assistant Window] Handoff mode! Starting listening directly without greeting.");
              voiceConv.startListening();
            } else {
              console.log("[Assistant Window] Fresh wake-word! Playing greeting and then listening.");
              voiceConv.playGreetingAndListen();
            }
          });
          unlisten = unsub;
      } catch (e) {
        console.warn("Failed to listen to wake event:", e);
      }
      };
      
      setupListener();
      
      // We do NOT auto-start on load to prevent locking the microphone in the background!
      // The window will start listening only when it receives the "wake-assistant" event.
      
      return () => {
        if (unlisten) unlisten();
      };
    }, []);

    return (
      <JarvisVoiceOverlay
        state={voiceConv.state}
        interimTranscript={voiceConv.interimTranscript}
        finalTranscript={voiceConv.finalTranscript}
        assistantText={voiceConv.assistantText}
        onClose={voiceConv.stopConversation}
        onStop={voiceConv.stopConversation}
        layoutMode="bottom-right"
      />
    );
  }
  const { messages, sendMessage, isLoading, activeConversationId, error, startNewChat } = useChat();
  const [currentView, setCurrentView] = useState<"main" | "control-center">("main");
  const [initialControlPage, setInitialControlPage] = useState<ControlPage>("overview");
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

  // When conversation ends, restart wake word listening after a short delay
  // to ensure any active ASR/microphones are fully released by the browser
  const handleConversationIdle = useCallback(() => {
    setTimeout(() => {
      const v = voiceRef.current;
      // Only restart wake word in the main window if it is currently in the foreground/focused!
      if (v && !v.isWakeWordListening && document.hasFocus()) {
        console.log("[App] Restarting wake word after conversation idle");
        v.toggleListening();
      } else {
        console.log("[App] Main window is in background, skipping wake word restart");
      }
    }, 500);
  }, []);

  // Streaming voice conversation (primary)
  const voiceConv = useVoiceConversation(
    activeConversationId,
    handleConversationIdle,
    startNewChat,
  );

  const showAssistantWindow = useCallback(async (isHandoff = false) => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { currentMonitor, LogicalSize, LogicalPosition } = await import("@tauri-apps/api/window");
      
      let assistant = await WebviewWindow.getByLabel("assistant");
      
      const ASSISTANT_WIDTH = 360;
      const ASSISTANT_HEIGHT = 440;
      const MARGIN_RIGHT = 24;
      const MARGIN_BOTTOM = 24;
      
      if (!assistant) {
        console.log("[App] Assistant window not found, creating dynamically");
        assistant = new WebviewWindow("assistant", {
          url: "index.html?assistant=true",
          title: "Jarvis Assistant",
          width: ASSISTANT_WIDTH,
          height: ASSISTANT_HEIGHT,
          visible: false,
          decorations: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          transparent: true,
          shadow: true,
        });
        
        await new Promise<void>((resolve, reject) => {
          assistant!.once("tauri://created", () => resolve());
          assistant!.once("tauri://error", (e) => reject(e));
        });
      }
      
      const monitor = await currentMonitor().catch(() => null);
      if (monitor) {
        const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
        const scaleFactor = monitor.scaleFactor || 1;
        
        const workWidthLogical = workArea.size.width / scaleFactor;
        const workHeightLogical = workArea.size.height / scaleFactor;
        const workXLogical = workArea.position.x / scaleFactor;
        const workYLogical = workArea.position.y / scaleFactor;
        
        const x = workXLogical + workWidthLogical - ASSISTANT_WIDTH - MARGIN_RIGHT;
        const y = workYLogical + workHeightLogical - ASSISTANT_HEIGHT - MARGIN_BOTTOM;
        
        await assistant.setSize(new LogicalSize(ASSISTANT_WIDTH, ASSISTANT_HEIGHT)).catch(() => {});
        await assistant.setPosition(new LogicalPosition(x, y)).catch(() => {});
      }
      
      await assistant.setAlwaysOnTop(true).catch(() => {});
      await assistant.unminimize().catch(() => {});
      await assistant.show().catch(() => {});
      await assistant.setFocus().catch(() => {});
      
      // Emit event to assistant window to wake it up, passing the handoff state
      await assistant.emit("wake-assistant", { isHandoff }).catch(() => {});
    } catch (err) {
      console.error("Failed to show assistant window:", err);
    }
  }, []);

  // Wake word detection (from useVoice)
  const handleWake = useCallback(() => {
    if (document.hasFocus()) {
      console.log("[App] Foreground wake-word. Playing greeting centered...");
      voiceConv.playGreetingAndListen();
    } else {
      console.log("[App] Background wake-word. Showing assistant window...");
      showAssistantWindow();
    }
  }, [voiceConv, showAssistantWindow]);

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
    } else if (view === "control-center") {
      setCurrentView("control-center");
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

  // Listen to assistant window going idle to restart wake-word listening!
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setupListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const unsub = await appWindow.listen("assistant-idle", () => {
          console.log("[Main Window] Assistant window went idle. Restarting wake-word engine...");
          const v = voiceRef.current;
          if (v && !v.isWakeWordListening) {
            v.toggleListening();
          }
        });
        unlisten = unsub;
      } catch (e) {
        console.warn("Failed to listen to assistant-idle event:", e);
      }
    };
    
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Listen to main window focus changes to:
  // 1. Terminate main mic capture/wake-word in the background to free up the hardware mic.
  // 2. Seamlessly hand off active dialogue to the assistant bubble when blurred.
  // 3. Close the assistant bubble and restart wake-word when focused back in foreground.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        
        const unsub = await appWindow.onFocusChanged(async ({ payload: focused }) => {
          const v = voiceRef.current;
          
          if (!focused) {
            console.log("[App] Main window lost focus (blurred). Releasing voice engines...");
            
            // Check if voice conversation was active
            const isConversationActive = voiceConv.state !== "idle" && voiceConv.state !== "error";
            
            // First stop any active dialogue
            if (isConversationActive) {
              voiceConv.stopConversation();
            }
            
            // Completely stop all active mic recording / wake-word to free up hardware mic
            if (v) {
              v.stopListening();
              if (v.isWakeWordListening) {
                v.toggleListening(); // Stops Porcupine and sets wantsContinuous = false
              }
            }
            
            // Trigger assistant bubble takeover with a 200ms delay to allow browser to release mic
            if (isConversationActive) {
              setTimeout(() => {
                showAssistantWindow(true);
              }, 200);
            }
          } else {
            console.log("[App] Main window gained focus (focused). Restoring foreground voice engine...");
            
            // 1. Hide the assistant window if it is open
            try {
              const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
              const assistant = await WebviewWindow.getByLabel("assistant");
              if (assistant) {
                await assistant.hide().catch(() => {});
              }
            } catch (e) {
              console.warn("Failed to hide assistant window:", e);
            }
            
            // 2. Refresh conversation messages to instantly merge the bubble's dialogue logs
            refreshMessages();
            
            // 3. Restart wake-word engine in the foreground
            if (v && !v.isWakeWordListening) {
              v.toggleListening(); // Starts Porcupine
            }
          }
        });
        unlisten = unsub;
      } catch (e) {
        console.warn("Failed to listen to window focus event:", e);
      }
    };
    
    setupFocusListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [voiceConv.state, showAssistantWindow, refreshMessages]);

  // Determine which state to show in VoicePanel
  const panelState = voiceConv.state !== "idle" ? voiceConv.state : voice.state;
  const panelTranscript =
    voiceConv.state !== "idle" ? voiceConv.finalTranscript : voice.transcript;
  const panelSupported = voiceConv.isSupported || voice.isSupported;

  // Control Center view
  if (currentView === "control-center") {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <ControlCenter onBack={() => setCurrentView("main")} initialPage={initialControlPage} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
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
            onClick={() => setCurrentView("control-center")}
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
          voiceUserText={voiceConv.state !== "idle" ? voiceConv.finalTranscript || undefined : undefined}
          voiceAssistantText={voiceConv.state !== "idle" ? voiceConv.assistantText || undefined : undefined}
          isVoiceStreaming={voiceConv.state === "streaming"}
        />
      </main>
      </div>

      {/* Command Palette (Alt+Space) */}
      <CommandPalette
        onChat={handlePaletteChat}
        onNavigate={handlePaletteNavigate}
        onVoiceToggle={handleVoiceToggle}
      />

      {/* Futuristic Sci-Fi Voice Overlay */}
      <JarvisVoiceOverlay
        state={voiceConv.state}
        interimTranscript={voiceConv.interimTranscript}
        finalTranscript={voiceConv.finalTranscript}
        assistantText={voiceConv.assistantText}
        onClose={voiceConv.stopConversation}
        onStop={voiceConv.stopConversation}
        onOpenSettings={() => {
          setInitialControlPage("models");
          setCurrentView("control-center");
        }}
        layoutMode={voiceConv.layoutMode}
      />
    </div>
  );
}

export default App;
