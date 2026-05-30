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
  // If this is the assistant floating window, run in a super-lightweight pure visual mirroring mode!
  if (isAssistantWindow) {
    const [mirroredState, setMirroredState] = useState<any>("idle");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [finalTranscript, setFinalTranscript] = useState("");
    const [assistantText, setAssistantText] = useState("");

    // Ensure the document background is fully transparent so Tauri window transparency works
    useEffect(() => {
      if (typeof document !== "undefined") {
        document.body.style.backgroundColor = "transparent";
        document.documentElement.style.backgroundColor = "transparent";
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
      }
    }, []);

    // Listen to voice state mirror events and notify main window only when fully ready
    useEffect(() => {
      let active = true;
      let unlistenMirror: (() => void) | null = null;
      
      const setupAssistantMirror = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          
          if (!active) return;
          
          // 1. Register voice state mirror event listener FIRST
          const unsub = await appWindow.listen<{
            state: any;
            interimTranscript: string;
            finalTranscript: string;
            assistantText: string;
          }>("voice-state-mirror", (event) => {
            if (!active) return;
            const p = event.payload;
            console.log("[Assistant Window] Received voice mirror state:", p);
            setMirroredState(p.state);
            setInterimTranscript(p.interimTranscript);
            setFinalTranscript(p.finalTranscript);
            setAssistantText(p.assistantText);
          });
          
          if (!active) {
            try { unsub(); } catch {}
            return;
          }
          unlistenMirror = unsub;
          console.log("[Assistant Window] Mirror listener successfully registered. Notifying main window...");
          
          // 2. ONLY notify the main window AFTER listener is guaranteed to be active to avoid event loss
          await appWindow.emit("assistant-ready").catch(() => {});
        } catch (e) {
          console.warn("Failed to set up assistant window mirroring:", e);
        }
      };
      
      setupAssistantMirror();
      
      return () => {
        active = false;
        if (unlistenMirror) {
          try { unlistenMirror(); } catch (err) {}
        }
      };
    }, []);

    // Cleanly emit a close/stop event back to the main window
    const handleStopMirror = useCallback(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.emit("stop-voice-from-assistant").catch(() => {});
        await appWindow.close().catch(() => {});
      } catch (e) {
        console.warn("Failed to emit stop from assistant:", e);
      }
    }, []);

    const handleFinishMirror = useCallback(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.emit("finish-voice-from-assistant").catch(() => {});
      } catch (e) {
        console.warn("Failed to emit finish from assistant:", e);
      }
    }, []);

    const handleOpenSettings = useCallback(async () => {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const mainWin = await WebviewWindow.getByLabel("main");
        if (mainWin) {
          await mainWin.show().catch(() => {});
          await mainWin.unminimize().catch(() => {});
          await mainWin.setFocus().catch(() => {});
        }
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.emit("open-settings-from-assistant").catch(() => {});
        await appWindow.close().catch(() => {});
      } catch (e) {
        console.warn("Failed to open settings from assistant:", e);
      }
    }, []);

    return (
      <JarvisVoiceOverlay
        state={mirroredState}
        interimTranscript={interimTranscript}
        finalTranscript={finalTranscript}
        assistantText={assistantText}
        onClose={handleStopMirror}
        onStop={mirroredState === "listening" ? handleFinishMirror : handleStopMirror}
        onOpenSettings={handleOpenSettings}
        layoutMode="bottom-right"
      />
    );
  }
  const { messages, sendMessage, isLoading, activeConversationId, error, startNewChat } = useChat();
  const [isMainWindowFocused, setIsMainWindowFocused] = useState(true);
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
  // to ensure any active ASR/microphones are fully released by the browser.
  // Since the assistant window operates as a pure visual mirror, the main window
  // is the sole Voice Core Host and can safely listen for wake words in the background.
  const handleConversationIdle = useCallback(() => {
    setTimeout(() => {
      const v = voiceRef.current;
      if (v && !v.isWakeWordListening) {
        console.log("[App] Restarting wake word after conversation idle (background-safe)");
        v.toggleListening();
      }
    }, 500);
  }, []);

  // Streaming voice conversation (primary)
  const voiceConv = useVoiceConversation(
    activeConversationId,
    handleConversationIdle,
    startNewChat,
  );

  // Keep voiceConv ref in sync to avoid stale closures in focus handler timeouts
  const voiceConvRef = useRef(voiceConv);
  useEffect(() => {
    voiceConvRef.current = voiceConv;
  }, [voiceConv]);

  const showAssistantWindow = useCallback(async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { currentMonitor, LogicalSize, LogicalPosition } = await import("@tauri-apps/api/window");
      
      let assistant = await WebviewWindow.getByLabel("assistant");
      
      const ASSISTANT_WIDTH = 360;
      const ASSISTANT_HEIGHT = 440;
      const MARGIN_RIGHT = 24;
      const MARGIN_BOTTOM = 24;
      
      if (!assistant) {
        console.log("[App] Assistant window not found, creating dynamically...");
        
        let unlistenReady: (() => void) | null = null;
        
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        unlistenReady = await appWindow.listen("assistant-ready", async () => {
          console.log("[App] Main window received assistant-ready! Syncing voice state mirror...");
          if (unlistenReady) {
            unlistenReady();
            unlistenReady = null;
          }
          const createdAssistant = await WebviewWindow.getByLabel("assistant");
          if (createdAssistant) {
            // 1. Show and unminimize non-blockingly
            createdAssistant.show().catch(() => {});
            createdAssistant.unminimize().catch(() => {});
            
            // 2. Position non-blockingly
            const monitor = await currentMonitor().catch(() => null);
            if (monitor) {
              const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
              const scaleFactor = monitor.scaleFactor || 1;
              const workWidthLogical = workArea.size.width / scaleFactor;
              const workHeightLogical = workArea.size.height / scaleFactor;
              const workXLogical = workArea.position.x / scaleFactor;
              const workYLogical = workArea.position.y / scaleFactor;
              const x = Math.max(workXLogical, workXLogical + workWidthLogical - ASSISTANT_WIDTH - MARGIN_RIGHT);
              const y = Math.max(workYLogical, workYLogical + workHeightLogical - ASSISTANT_HEIGHT - MARGIN_BOTTOM);
              createdAssistant.setSize(new LogicalSize(ASSISTANT_WIDTH, ASSISTANT_HEIGHT)).catch(() => {});
              createdAssistant.setPosition(new LogicalPosition(x, y)).catch(() => {});
            }
            
            // 3. Focus and AlwaysOnTop non-blockingly
            createdAssistant.setAlwaysOnTop(true).catch(() => {});
            createdAssistant.setFocus().catch(() => {});
            
            // 4. Immediately emit state mirror so bubble is synced upon mount
            appWindow.emit("voice-state-mirror", {
              state: voiceConvRef.current.state,
              interimTranscript: voiceConvRef.current.interimTranscript,
              finalTranscript: voiceConvRef.current.finalTranscript,
              assistantText: voiceConvRef.current.assistantText,
              layoutMode: voiceConvRef.current.layoutMode,
            }).catch(() => {});
          }
        });
        
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
          assistant!.once("tauri://error", (e) => {
            if (unlistenReady) unlistenReady();
            reject(e);
          });
        });
      } else {
        // If it already exists, just show, position, focus, and sync non-blockingly!
        assistant.show().catch(() => {});
        assistant.unminimize().catch(() => {});
        
        const monitor = await currentMonitor().catch(() => null);
        if (monitor) {
          const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
          const scaleFactor = monitor.scaleFactor || 1;
          const workWidthLogical = workArea.size.width / scaleFactor;
          const workHeightLogical = workArea.size.height / scaleFactor;
          const workXLogical = workArea.position.x / scaleFactor;
          const workYLogical = workArea.position.y / scaleFactor;
          const x = Math.max(workXLogical, workXLogical + workWidthLogical - ASSISTANT_WIDTH - MARGIN_RIGHT);
          const y = Math.max(workYLogical, workYLogical + workHeightLogical - ASSISTANT_HEIGHT - MARGIN_BOTTOM);
          assistant.setSize(new LogicalSize(ASSISTANT_WIDTH, ASSISTANT_HEIGHT)).catch(() => {});
          assistant.setPosition(new LogicalPosition(x, y)).catch(() => {});
        }
        
        assistant.setAlwaysOnTop(true).catch(() => {});
        assistant.setFocus().catch(() => {});
        
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        appWindow.emit("voice-state-mirror", {
          state: voiceConvRef.current.state,
          interimTranscript: voiceConvRef.current.interimTranscript,
          finalTranscript: voiceConvRef.current.finalTranscript,
          assistantText: voiceConvRef.current.assistantText,
          layoutMode: voiceConvRef.current.layoutMode,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to show assistant window:", err);
    }
  }, []);

  // Wake word detection (from useVoice)
  const handleWake = useCallback(() => {
    console.log("[App] Wake-word detected. Starting voice session on core engine...");
    // 1. Play greeting and start listening on core engine
    voiceConv.playGreetingAndListen();
    
    // 2. Only open assistant mirror window if main window is in background
    if (!document.hasFocus()) {
      console.log("[App] Background wake-word: opening assistant mirror bubble...");
      showAssistantWindow();
    } else {
      console.log("[App] Foreground wake-word: keeping centered overlay inside main window.");
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

  // Emit voice state changes to the assistant window to mirror the overlay
  useEffect(() => {
    const emitState = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        await appWindow.emit("voice-state-mirror", {
          state: voiceConv.state,
          interimTranscript: voiceConv.interimTranscript,
          finalTranscript: voiceConv.finalTranscript,
          assistantText: voiceConv.assistantText,
          layoutMode: voiceConv.layoutMode,
        }).catch(() => {});
      } catch (e) {
        console.warn("Failed to emit voice state mirror:", e);
      }
    };
    emitState();
  }, [voiceConv.state, voiceConv.interimTranscript, voiceConv.finalTranscript, voiceConv.assistantText, voiceConv.layoutMode]);

  // Listen to events from the assistant window
  useEffect(() => {
    let active = true;
    let unlisteners: (() => void)[] = [];
    
    const setupListeners = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        
        const stop = await appWindow.listen("stop-voice-from-assistant", () => {
          console.log("[Main Window] Received stop command from assistant window. Stopping conversation...");
          voiceConvRef.current.stopConversation();
        });
        if (!active) { stop(); return; }
        unlisteners.push(stop);
        
        const finish = await appWindow.listen("finish-voice-from-assistant", () => {
          console.log("[Main Window] Received finish command from assistant window. Submitting current text...");
          voiceConvRef.current.finishListening();
        });
        if (!active) { finish(); return; }
        unlisteners.push(finish);

        const settings = await appWindow.listen("open-settings-from-assistant", () => {
          console.log("[Main Window] Received open-settings command from assistant window.");
          setInitialControlPage("models");
          setCurrentView("control-center");
        });
        if (!active) { settings(); return; }
        unlisteners.push(settings);
      } catch (e) {
        console.warn("Failed to set up assistant event listeners in main window:", e);
      }
    };
    
    setupListeners();
    return () => {
      active = false;
      unlisteners.forEach((unsub) => {
        try { unsub(); } catch (err) {}
      });
    };
  }, []);

  // Automatically close assistant window if voice state goes idle
  useEffect(() => {
    if (voiceConv.state === "idle") {
      const closeAssistant = async () => {
        try {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const assistant = await WebviewWindow.getByLabel("assistant");
          if (assistant) {
            await assistant.close().catch(() => {});
          }
        } catch {}
      };
      closeAssistant();
    }
  }, [voiceConv.state]);

  // Listen to main window focus changes to manage assistant window overlay mirroring
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;
    
    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        
        if (!active) return;
        
        const unsub = await appWindow.onFocusChanged(async ({ payload: focused }) => {
          if (!active) return;
          const v = voiceRef.current;
          
          if (!focused) {
            console.log("[App] Main window lost focus (blurred).");
            
            // Update focused state to hide centered overlay
            setIsMainWindowFocused(false);
            
            // Cleanly pause physical ASR to prevent OS/browser mic lock-ups or premature farewells
            const vc = voiceConvRef.current;
            vc.handleWindowBlur();
            
            // If conversation is active, open the assistant window as a mirror
            const isConversationActive = vc.state !== "idle" && vc.state !== "error";
            if (isConversationActive) {
              console.log("[App] Blur during active conversation: showing assistant window to mirror state.");
              showAssistantWindow();
            }
          } else {
            console.log("[App] Main window gained focus (focused). Closing assistant window...");
            
            // Restore focused state to show centered overlay
            setIsMainWindowFocused(true);
            
            // Close the assistant window if it is open
            try {
              const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
              const assistant = await WebviewWindow.getByLabel("assistant");
              if (assistant) {
                await assistant.close().catch(() => {});
              }
            } catch (e) {
              console.warn("Failed to close assistant window:", e);
            }
            
            // Refresh conversation messages to merge any background dialogue logs
            refreshMessages();
            
            // Cleanly resume physical ASR if we were actively listening
            const vc = voiceConvRef.current;
            vc.handleWindowFocus();
            
            // Restart wake-word engine in the foreground if no conversation is active
            const isConversationActive = vc.state !== "idle" && vc.state !== "error";
            if (!isConversationActive) {
              if (v && !v.isWakeWordListening) {
                v.toggleListening();
              }
            }
          }
        });
        
        if (!active) {
          try { unsub(); } catch {}
          return;
        }
        unlisten = unsub;
      } catch (e) {
        console.warn("Failed to listen to window focus event:", e);
      }
    };
    
    setupFocusListener();
    return () => {
      active = false;
      if (unlisten) {
        try { unlisten(); } catch (err) {}
      }
    };
  }, [showAssistantWindow, refreshMessages]);

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
      {isMainWindowFocused && (
        <JarvisVoiceOverlay
          state={voiceConv.state}
          interimTranscript={voiceConv.interimTranscript}
          finalTranscript={voiceConv.finalTranscript}
          assistantText={voiceConv.assistantText}
          onClose={voiceConv.stopConversation}
          onStop={voiceConv.state === "listening" ? voiceConv.finishListening : voiceConv.bargeIn}
          onOpenSettings={() => {
            setInitialControlPage("models");
            setCurrentView("control-center");
          }}
          layoutMode="centered"
        />
      )}
    </div>
  );
}

export default App;
