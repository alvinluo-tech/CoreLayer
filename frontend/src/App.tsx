import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ConversationList } from '@/components/chat/ConversationList';
import { TodayView } from '@/components/modules/todo/TodayView';
import { ReadingList } from '@/components/modules/reading/ReadingList';
import { DailySummary } from '@/components/modules/review/DailySummary';
import { VoicePanel } from '@/components/voice/VoicePanel';
import { JarvisVoiceOverlay } from '@/components/voice/JarvisVoiceOverlay';
import { DataPanelContainer } from '@/components/data-panel/DataPanelContainer';
import { AssistantMirror } from '@/components/voice/AssistantMirror';
import { ControlCenter } from '@/components/control-center/ControlCenter';
import type { ControlPage } from '@/components/control-center/ControlCenter';
import { RightPanel } from '@/components/right-panel/RightPanel';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ShortcutsOverlay } from '@/components/ui/ShortcutsOverlay';
import { logger } from '@/lib/logger';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { useVoiceFSM } from '@/hooks/useVoiceFSM';
import { useConversationStore } from '@/stores/conversationStore';
import { usePaletteStore } from '@/stores/paletteStore';
import { useTaskStore } from '@/stores/taskStore';
import { useArticleStore } from '@/stores/articleStore';
import { useReviewStore } from '@/stores/reviewStore';
import { Separator } from '@/components/ui/separator';
import { TitleBar } from '@/components/layout/TitleBar';

const isAssistantWindow =
  typeof window !== 'undefined' && window.location.search.includes('assistant=true');

function MainApp() {
  const { messages, sendMessage, isLoading, activeConversationId, error } = useChat();
  const [isMainWindowFocused, setIsMainWindowFocused] = useState(true);
  const [currentView, setCurrentView] = useState<'main' | 'control-center'>('main');
  const [initialControlPage, setInitialControlPage] = useState<ControlPage>('overview');
  const paletteToggle = usePaletteStore((s) => s.toggle);

  // Global keyboard shortcut: Alt+Space to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        paletteToggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
        logger.debug('[App] Restarting wake word after conversation idle (background-safe)');
        v.toggleListening();
      }
    }, 500);
  }, []);

  const getOrCreateDefaultConversation = useConversationStore(
    (s) => s.getOrCreateDefaultConversation
  );

  // Streaming voice conversation (primary)
  const voiceConv = useVoiceFSM({
    conversationId: activeConversationId,
    onIdle: handleConversationIdle,
    createConversation: getOrCreateDefaultConversation,
  });

  // Keep voiceConv ref in sync to avoid stale closures in focus handler timeouts
  const voiceConvRef = useRef(voiceConv);
  useEffect(() => {
    voiceConvRef.current = voiceConv;
  }, [voiceConv]);

  // Keep active monitor and startup normal bounds cached
  const activeMonitorRef = useRef<any>(null);
  const startupBoundsRef = useRef<{ size: any; position: any } | null>(null);

  useEffect(() => {
    const captureStartupMonitorAndBounds = async () => {
      try {
        const { currentMonitor, getCurrentWindow } = await import('@tauri-apps/api/window');
        const monitor = await currentMonitor();
        if (monitor) {
          activeMonitorRef.current = monitor;
          logger.debug('[App] Successfully captured startup monitor:', monitor.name);
        }

        const appWindow = getCurrentWindow();
        const size = await appWindow.outerSize().catch(() => null);
        const position = await appWindow.outerPosition().catch(() => null);
        if (size && position && size.width > 100 && size.height > 100) {
          startupBoundsRef.current = { size, position };
          logger.debug(
            '[App] Successfully captured startup window bounds:',
            startupBoundsRef.current
          );
        }
      } catch (e) {
        console.warn('Failed to capture startup monitor and bounds:', e);
      }
    };
    captureStartupMonitorAndBounds();
  }, []);

  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const isMirrorModeRef = useRef(false);
  useEffect(() => {
    isMirrorModeRef.current = isMirrorMode;
  }, [isMirrorMode]);
  const originalBoundsRef = useRef<{ size: any; position: any } | null>(null);
  const isProgrammaticFocusRef = useRef(false);

  const enterMirrorMode = useCallback(async () => {
    try {
      const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
      const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi');

      const appWindow = getCurrentWindow();

      // Set programmatic focus flag to prevent onFocusChanged from exiting mirror mode immediately
      isProgrammaticFocusRef.current = true;
      setTimeout(() => {
        isProgrammaticFocusRef.current = false;
      }, 1000); // 1000ms safety window for OS window manager animations

      // 1. Capture original bounds if window is not minimized and we haven't already
      const isMinimized = await appWindow.isMinimized().catch(() => false);
      if (!isMinimized && !originalBoundsRef.current) {
        const size = await appWindow.outerSize().catch(() => null);
        const position = await appWindow.outerPosition().catch(() => null);
        if (size && position && size.width > 100 && size.height > 100) {
          originalBoundsRef.current = { size, position };
          logger.debug('[App] Saved original main window bounds:', originalBoundsRef.current);
        }
      }

      // 1.5 Unminimize and show first to ensure the window is active and visible
      await appWindow.show().catch(() => {});
      await appWindow.unminimize().catch(() => {});

      const ASSISTANT_WIDTH = 360;
      const ASSISTANT_HEIGHT = 440;
      const MARGIN_RIGHT = 24;
      const MARGIN_BOTTOM = 24;

      // 2. Query active monitor
      let monitor = await currentMonitor().catch(() => null);
      if (!monitor) {
        monitor = activeMonitorRef.current;
      }
      if (!monitor) {
        try {
          const { primaryMonitor } = await import('@tauri-apps/api/window');
          monitor = await primaryMonitor();
        } catch {
          /* fallback to null */
        }
      }

      if (monitor) {
        const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
        const scaleFactor = monitor.scaleFactor || 1;

        const workWidthPhysical =
          workArea.size?.width ?? (workArea as any).width ?? monitor.size.width;
        const workHeightPhysical =
          workArea.size?.height ?? (workArea as any).height ?? monitor.size.height;
        const workXPhysical = workArea.position?.x ?? (workArea as any).x ?? monitor.position.x;
        const workYPhysical = workArea.position?.y ?? (workArea as any).y ?? monitor.position.y;

        const assistantWidthPhysical = Math.round(ASSISTANT_WIDTH * scaleFactor);
        const assistantHeightPhysical = Math.round(ASSISTANT_HEIGHT * scaleFactor);
        const marginRightPhysical = Math.round(MARGIN_RIGHT * scaleFactor);
        const marginBottomPhysical = Math.round(MARGIN_BOTTOM * scaleFactor);

        const x = Math.max(
          workXPhysical,
          workXPhysical + workWidthPhysical - assistantWidthPhysical - marginRightPhysical
        );
        const y = Math.max(
          workYPhysical,
          workYPhysical + workHeightPhysical - assistantHeightPhysical - marginBottomPhysical
        );

        // 3. Remove decorations and set always-on-top first
        await appWindow.setDecorations(false).catch(() => {});
        await appWindow.setAlwaysOnTop(true).catch(() => {});

        // 4. Set size and position in physical pixels
        await appWindow
          .setSize(new PhysicalSize(assistantWidthPhysical, assistantHeightPhysical))
          .catch(() => {});
        await appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {});

        // Double-apply after 100ms to bypass OS asynchronous DWM transitions
        setTimeout(async () => {
          await appWindow
            .setSize(new PhysicalSize(assistantWidthPhysical, assistantHeightPhysical))
            .catch(() => {});
          await appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {});
        }, 100);
      }

      setIsMirrorMode(true);
      logger.debug('[App] Main window morphed into bottom-right mirror overlay.');
    } catch (err) {
      console.warn('Failed to enter mirror mode:', err);
    }
  }, []);

  const exitMirrorMode = useCallback(async (shouldMinimize = false) => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      // 1. Unconditionally restore decorations (keep borderless) and always-on-top
      await appWindow.setDecorations(false).catch(() => {});
      await appWindow.setAlwaysOnTop(false).catch(() => {});

      // 2. Restore size and position (using captured original bounds, with startupBounds fallbacks)
      let targetSize = originalBoundsRef.current?.size;
      const targetPosition = originalBoundsRef.current?.position;

      if (!targetSize) {
        if (startupBoundsRef.current?.size) {
          targetSize = startupBoundsRef.current.size;
        } else {
          const { LogicalSize } = await import('@tauri-apps/api/dpi');
          targetSize = new LogicalSize(1200, 800);
        }
      }

      if (targetSize) {
        await appWindow.setSize(targetSize).catch(() => {});
      }

      if (targetPosition) {
        await appWindow.setPosition(targetPosition).catch(() => {});
      } else {
        // If no position captured, center the window
        await appWindow.center().catch(() => {});
      }

      originalBoundsRef.current = null;
      logger.debug('[App] Restored main window dimensions and decorations.');

      // 3. Cleanly minimize or unminimize/show based on the trigger
      if (shouldMinimize) {
        logger.debug('[App] Minimizing window to taskbar for clean background hide.');
        setIsMainWindowFocused(false);
        await appWindow.minimize().catch(() => {});
      } else {
        // If expanding, ensure it's unminimized, shown, and focused
        await appWindow.unminimize().catch(() => {});
        await appWindow.show().catch(() => {});
        await appWindow.setFocus().catch(() => {});
      }

      setIsMirrorMode(false);
    } catch (err) {
      console.warn('Failed to exit mirror mode:', err);
    }
  }, []);

  // Wake word detection (from useVoice)
  const handleWake = useCallback(async () => {
    logger.debug('[App] Wake-word detected. Starting voice session on core engine...');
    // 1. Play greeting and start listening on core engine
    voiceConv.playGreetingAndListen();

    // 2. Only enter mirror mode if main window is in background (minimized or not focused)
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const isMinimized = await appWindow.isMinimized().catch(() => false);
      const isFocused = await appWindow.isFocused().catch(() => false);

      logger.debug('[App] Wake-word state detection:', {
        isMinimized,
        isFocused,
        isMainWindowFocused,
      });

      if (isMinimized || !isFocused) {
        logger.debug('[App] Background wake-word: shrinking main window to mirror overlay...');
        setIsMainWindowFocused(false);
        enterMirrorMode();
      } else {
        logger.debug('[App] Foreground wake-word: keeping centered overlay inside main window.');
      }
    } catch (err) {
      console.warn('Failed to dynamically check window state on wake-word:', err);
      // Fallback to React state
      if (!isMainWindowFocused) {
        enterMirrorMode();
      } else {
        logger.debug(
          '[App] Foreground wake-word (fallback): keeping centered overlay inside main window.'
        );
      }
    }
  }, [voiceConv, enterMirrorMode, isMainWindowFocused]);

  // When batch ASR transcription completes, start streaming conversation
  const handleVoiceCommand = useCallback(
    (text: string) => {
      voiceConv.startConversation(text);
    },
    [voiceConv]
  );

  const voice = useVoice(handleVoiceCommand, handleWake);
  voiceRef.current = voice;

  // Voice toggle: if conversation active, stop it; otherwise toggle wake word
  const handleVoiceToggle = useCallback(() => {
    if (voiceConv.state !== 'idle') {
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
    [sendMessage]
  );

  const handlePaletteNavigate = useCallback((view: string) => {
    if (view === 'new-chat') {
      // Will be handled by conversation store
    } else if (view === 'control-center') {
      setCurrentView('control-center');
    }
  }, []);

  // Refresh all dashboard and conversation states from the SQLite database
  const fetchConversations = useConversationStore((s) => s.fetchConversations);
  const refreshMessages = useConversationStore((s) => s.refreshMessages);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const fetchDailySummary = useReviewStore((s) => s.fetchDailySummary);

  const refreshAllDashboardStates = useCallback(async () => {
    logger.debug('[App] Refreshing all dashboard states from database...');
    try {
      await Promise.all([
        fetchConversations().catch(() => {}),
        refreshMessages().catch(() => {}),
        fetchTasks().catch(() => {}),
        fetchArticles().catch(() => {}),
        fetchDailySummary().catch(() => {}),
      ]);
    } catch (err) {
      console.warn('Failed to refresh dashboard states:', err);
    }
  }, [fetchConversations, refreshMessages, fetchTasks, fetchArticles, fetchDailySummary]);

  // Automatically refresh all dashboard states when text chat completes sending (and on mount)
  useEffect(() => {
    if (!isLoading) {
      refreshAllDashboardStates();
    }
  }, [isLoading, refreshAllDashboardStates]);

  // Refresh all dashboard states when voice conversation goes idle or listening
  useEffect(() => {
    if (voiceConv.state === 'idle' || voiceConv.state === 'listening') {
      refreshAllDashboardStates();
    }
  }, [voiceConv.state, refreshAllDashboardStates]);

  // Clear streamed voice text when persisted messages arrive from server
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      voiceConv.clearLastStreamedText();
    }
  }, [messages, voiceConv.clearLastStreamedText]);

  // Dynamically toggle body transparency and overflow when mirror mode starts/ends
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isMirrorMode) {
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      } else {
        document.body.style.backgroundColor = '';
        document.documentElement.style.backgroundColor = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }
    }
  }, [isMirrorMode]);

  // Programmatic focus grabber when transitioning to listening state in mirror mode
  useEffect(() => {
    if (isMirrorMode && voiceConv.state === 'listening') {
      const grabFocus = async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
          logger.debug(
            '[App] Entering listening state in mirror mode: programmatically grabbing OS focus to unblock Chromium ASR.'
          );
          isProgrammaticFocusRef.current = true;
          await appWindow.setFocus().catch(() => {});
          setTimeout(() => {
            isProgrammaticFocusRef.current = false;
          }, 300);
        } catch (e) {
          console.warn('Failed to programmatically focus shrunken window:', e);
        }
      };
      grabFocus();
    }
  }, [isMirrorMode, voiceConv.state]);

  // Automatically exit mirror mode if voice state goes idle or error, but only if we are in mirror mode
  useEffect(() => {
    if ((voiceConv.state === 'idle' || voiceConv.state === 'error') && isMirrorMode) {
      exitMirrorMode(true);
    }
  }, [voiceConv.state, isMirrorMode, exitMirrorMode]);

  // Listen to main window focus changes to manage mirror overlay morphing
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        if (!active) return;

        // Dynamically query and update the initial OS-level focus state
        const initialFocused = await appWindow.isFocused().catch(() => true);
        if (active) {
          setIsMainWindowFocused(initialFocused);
        }

        const unsub = await appWindow.onFocusChanged(async ({ payload: focused }) => {
          if (!active) return;
          const v = voiceRef.current;

          if (!focused) {
            logger.debug('[App] Main window lost focus (blurred).');
            setIsMainWindowFocused(false);

            // Check if conversation is active and we are NOT already in mirror mode
            const vc = voiceConvRef.current;
            const isConversationActive = vc.state !== 'idle' && vc.state !== 'error';
            if (isConversationActive && !isMirrorModeRef.current) {
              logger.debug('[App] Blur during active conversation: entering mirror mode.');
              enterMirrorMode();
            }
          } else {
            logger.debug('[App] Main window gained focus (focused).');
            setIsMainWindowFocused(true);

            if (isProgrammaticFocusRef.current) {
              logger.debug('[App] Focus gained programmatically. Ignoring mirror mode exit.');
              return;
            }

            // Re-capture active monitor since the window might have been dragged to another screen
            try {
              const { currentMonitor } = await import('@tauri-apps/api/window');
              const monitor = await currentMonitor();
              if (monitor) {
                activeMonitorRef.current = monitor;
              }
            } catch {
              /* ignore */
            }

            // Only exit mirror mode if we are actually in mirror mode
            if (isMirrorModeRef.current) {
              logger.debug('[App] Gained focus via user interaction: exiting mirror mode.');
              exitMirrorMode(false);
            }

            // Refresh conversation messages to merge any background dialogue logs
            refreshMessages();

            // Restart wake-word engine in the foreground if no conversation is active
            const vc = voiceConvRef.current;
            const isConversationActive = vc.state !== 'idle' && vc.state !== 'error';
            if (!isConversationActive) {
              if (v && !v.isWakeWordListening) {
                v.toggleListening();
              }
            }
          }
        });

        if (!active) {
          try {
            unsub();
          } catch {
            /* ignore */
          }
          return;
        }
        unlisten = unsub;
      } catch (e) {
        console.warn('Failed to listen to window focus event:', e);
      }
    };

    setupFocusListener();
    return () => {
      active = false;
      if (unlisten) {
        try {
          unlisten();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enterMirrorMode, exitMirrorMode, refreshMessages]);

  // If in mirror mode, render the bottom-right floating overlay with a fullscreen data panel on top
  if (isMirrorMode) {
    return (
      <>
        <JarvisVoiceOverlay
          state={voiceConv.state}
          interimTranscript={voiceConv.interimTranscript}
          finalTranscript={voiceConv.finalTranscript}
          assistantText={voiceConv.assistantText}
          thinkingText={voiceConv.thinkingText}
          isConnected={voiceConv.isConnected}
          onClose={handleVoiceToggle}
          onStop={
            voiceConv.state === 'listening' ? voiceConv.finishListening : voiceConv.stopConversation
          }
          onRetry={voiceConv.retryLastAction}
          onOpenSettings={() => {
            exitMirrorMode(false);
            setInitialControlPage('models');
            setCurrentView('control-center');
          }}
          onRestore={() => exitMirrorMode(false)}
          layoutMode="bottom-right"
        />
        {/* Data panel overlay — renders centered on screen when tool results arrive */}
        <DataPanelContainer overlay />
      </>
    );
  }

  // Determine which state to show in VoicePanel
  const panelState = voiceConv.state !== 'idle' ? voiceConv.state : voice.state;
  const panelTranscript = voiceConv.state !== 'idle' ? voiceConv.finalTranscript : voice.transcript;
  const panelSupported = voiceConv.isSupported || voice.isSupported;

  // Control Center view
  if (currentView === 'control-center') {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <ControlCenter onBack={() => setCurrentView('main')} initialPage={initialControlPage} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg-void)' }}
    >
      {/* Background effects — rendered behind everything */}
      <div className="grid-bg" />
      <div className="scanline-overlay" />

      {/* HUD corner decorations — Holo only (hidden via CSS in Focus mode) */}
      <div className="hud-corner tl" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner tr" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner bl" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner br" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>

      <TitleBar onSettings={() => setCurrentView('control-center')} />

      <div className="flex flex-1 overflow-hidden relative z-10">
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
            {/* Bottom gradient line */}
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

            <Separator variant="gradient" />

            {/* Module views */}
            <TodayView />
            <ReadingList />
            <DailySummary />
          </div>
        </aside>

        {/* Main area — Chat */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <ChatPanel
            messages={messages}
            onSend={sendMessage}
            isLoading={isLoading}
            hasActiveConversation={!!activeConversationId}
            error={error}
            conversationId={activeConversationId}
            voiceUserText={
              voiceConv.state !== 'idle' ? voiceConv.finalTranscript || undefined : undefined
            }
            voiceAssistantText={
              voiceConv.state !== 'idle' ? voiceConv.assistantText || undefined : undefined
            }
            isVoiceStreaming={voiceConv.state === 'streaming'}
          />
        </main>

        {/* Right panel — session, context, actions */}
        <aside
          className="w-[340px] flex flex-col overflow-hidden"
          style={{
            background: 'rgba(4,6,14,0.6)',
            backdropFilter: 'blur(12px)',
            borderLeft: '1px solid var(--glass-border)',
          }}
        >
          <RightPanel />
        </aside>
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
          thinkingText={voiceConv.thinkingText}
          isConnected={voiceConv.isConnected}
          onClose={voiceConv.stopConversation}
          onStop={voiceConv.state === 'listening' ? voiceConv.finishListening : voiceConv.bargeIn}
          onRetry={voiceConv.retryLastAction}
          onOpenSettings={() => {
            setInitialControlPage('models');
            setCurrentView('control-center');
          }}
          layoutMode="centered"
        />
      )}

      {/* Toast notifications */}
      <ToastContainer />

      {/* Keyboard shortcuts overlay */}
      <ShortcutsOverlay />

      {/* Bottom status bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: 'rgba(4,6,14,0.85)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--glass-border)',
          fontFamily: 'var(--font-data)',
          fontSize: 9,
          color: 'var(--text-tertiary)',
          letterSpacing: 1,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent, var(--cyan-glow), transparent)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>JARVIS v0.1.0</span>
          <span>·</span>
          <span>TAURI v2</span>
          <span>·</span>
          <span>REACT 19</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>ENCRYPTED</span>
          <span>·</span>
          <span>SESSION: {activeConversationId?.slice(0, 4).toUpperCase() ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  if (isAssistantWindow) {
    return <AssistantMirror />;
  }
  return <MainApp />;
}

export default App;
