import { useCallback, useEffect, useRef, useState } from 'react';
import { JarvisVoiceOverlay } from '@/components/voice/JarvisVoiceOverlay';
import { DataPanelContainer } from '@/components/data-panel/DataPanelContainer';
import { ControlCenter } from '@/components/control-center/ControlCenter';
import type { ControlPage } from '@/components/control-center/ControlCenter';
import { InspectorPane } from './InspectorPane';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ShortcutsOverlay } from '@/components/ui/ShortcutsOverlay';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { TitleBar } from '@/components/layout/TitleBar';
import { HudDecorations } from './HudDecorations';
import { BottomStatusBar } from './BottomStatusBar';
import { ShellLayout } from './ShellLayout';
import { GlobalRail } from './GlobalRail';
import { AssistantView } from './views/AssistantView';
import { TasksView } from './views/TasksView';
import { RunsView } from './views/RunsView';
import { MemoryView } from './views/MemoryView';
import { ApprovalsView } from './views/ApprovalsView';
import { ProjectsView } from './views/ProjectsView';
import { AgentsView } from './views/AgentsView';
import { WorkspaceView } from './views/WorkspaceView';
import { logger } from '@/lib/logger';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { useVoiceFSM } from '@/hooks/useVoiceFSM';
import { useMirrorMode } from '@/hooks/useMirrorMode';
import { useConversationStore } from '@/stores/conversationStore';
import { usePaletteStore } from '@/stores/paletteStore';
import { useTaskStore } from '@/stores/taskStore';
import { useArticleStore } from '@/stores/articleStore';
import { useReviewStore } from '@/stores/reviewStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useShellStore } from '@/stores/shellStore';
import { useRunStore } from '@/stores/runStore';
import { DaemonDisconnectedBanner } from '@/components/common/DaemonDisconnectedBanner';
import { jarvisClient } from '@/lib/jarvisClient';

export function AppShell() {
  const { messages, sendMessage, isLoading, activeConversationId, error } = useChat();
  const [isMainWindowFocused, setIsMainWindowFocused] = useState(true);
  const [initialControlPage, setInitialControlPage] = useState<ControlPage>('overview');
  const paletteToggle = usePaletteStore((s) => s.toggle);

  const { activeView, setActiveView } = useShellStore();
  const [daemonConnected, setDaemonConnected] = useState(true);

  // Mirror mode
  const {
    isMirrorMode,
    isMirrorModeRef,
    isProgrammaticFocusRef,
    activeMonitorRef,
    enterMirrorMode,
    exitMirrorMode,
  } = useMirrorMode();

  // Poll daemon health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        await jarvisClient.get('/api/health');
        setDaemonConnected(true);
      } catch {
        setDaemonConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, []);

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

  // Voice state
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);
  const handleConversationIdle = useCallback(() => {
    setTimeout(() => {
      const v = voiceRef.current;
      if (v && !v.isWakeWordListening) {
        logger.debug('[AppShell] Restarting wake word after conversation idle');
        v.toggleListening();
      }
    }, 500);
  }, []);

  const getOrCreateDefaultConversation = useConversationStore(
    (s) => s.getOrCreateDefaultConversation
  );

  const voiceConv = useVoiceFSM({
    conversationId: activeConversationId,
    onIdle: handleConversationIdle,
    createConversation: getOrCreateDefaultConversation,
  });

  const voiceConvRef = useRef(voiceConv);
  useEffect(() => {
    voiceConvRef.current = voiceConv;
  }, [voiceConv]);

  // Mirror mode body style
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

  // Focus grab for ASR in mirror mode
  useEffect(() => {
    if (isMirrorMode && voiceConv.state === 'listening') {
      const grabFocus = async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();
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

  // Auto-exit mirror on idle/error
  useEffect(() => {
    if ((voiceConv.state === 'idle' || voiceConv.state === 'error') && isMirrorMode) {
      exitMirrorMode(true);
    }
  }, [voiceConv.state, isMirrorMode, exitMirrorMode]);

  // Wake word handler
  const handleWake = useCallback(async () => {
    logger.debug('[AppShell] Wake-word detected.');
    voiceConv.playGreetingAndListen();

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const isMinimized = await appWindow.isMinimized().catch(() => false);
      const isFocused = await appWindow.isFocused().catch(() => false);

      if (isMinimized || !isFocused) {
        setIsMainWindowFocused(false);
        enterMirrorMode();
      }
    } catch (err) {
      console.warn('Failed to check window state on wake-word:', err);
      if (!isMainWindowFocused) enterMirrorMode();
    }
  }, [voiceConv, enterMirrorMode, isMainWindowFocused]);

  const handleVoiceCommand = useCallback(
    (text: string) => {
      voiceConv.startConversation(text);
    },
    [voiceConv]
  );

  const voice = useVoice(handleVoiceCommand, handleWake);
  voiceRef.current = voice;

  const handleVoiceToggle = useCallback(() => {
    if (voiceConv.state !== 'idle') {
      voiceConv.stopConversation();
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

  const handlePaletteNavigate = useCallback(
    (view: string) => {
      if (view === 'new-chat') {
        // handled by conversation store
      } else if (view === 'control-center') {
        setActiveView('control-center');
      } else {
        const shellView = view as import('@/stores/shellStore').ShellView;
        setActiveView(shellView);
      }
    },
    [setActiveView]
  );

  // Dashboard refresh
  const fetchConversations = useConversationStore((s) => s.fetchConversations);
  const refreshMessages = useConversationStore((s) => s.refreshMessages);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const fetchDailySummary = useReviewStore((s) => s.fetchDailySummary);
  const fetchApprovals = useApprovalStore((s) => s.fetchApprovals);
  const pendingApprovalCount = useApprovalStore(
    (s) => s.approvals.filter((a) => a.status === 'pending').length
  );
  const runs = useRunStore((s) => s.runs);
  const fetchRuns = useRunStore((s) => s.fetchRuns);
  const activeRunCount = runs.filter((r) => r.status === 'running').length;

  const refreshAllDashboardStates = useCallback(async () => {
    try {
      await Promise.all([
        fetchConversations().catch(() => {}),
        refreshMessages().catch(() => {}),
        fetchTasks().catch(() => {}),
        fetchArticles().catch(() => {}),
        fetchDailySummary().catch(() => {}),
        fetchApprovals().catch(() => {}),
        fetchRuns().catch(() => {}),
      ]);
    } catch (err) {
      console.warn('Failed to refresh dashboard states:', err);
    }
  }, [
    fetchConversations,
    refreshMessages,
    fetchTasks,
    fetchArticles,
    fetchDailySummary,
    fetchApprovals,
    fetchRuns,
  ]);

  useEffect(() => {
    if (!isLoading) refreshAllDashboardStates();
  }, [isLoading, refreshAllDashboardStates]);

  useEffect(() => {
    if (voiceConv.state === 'idle' || voiceConv.state === 'listening') {
      refreshAllDashboardStates();
    }
  }, [voiceConv.state, refreshAllDashboardStates]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      voiceConv.clearLastStreamedText();
    }
  }, [messages, voiceConv.clearLastStreamedText]);

  // Window focus listener
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        if (!active) return;

        const initialFocused = await appWindow.isFocused().catch(() => true);
        if (active) setIsMainWindowFocused(initialFocused);

        const unsub = await appWindow.onFocusChanged(async ({ payload: focused }) => {
          if (!active) return;
          const v = voiceRef.current;

          if (!focused) {
            setIsMainWindowFocused(false);
            const vc = voiceConvRef.current;
            const isConversationActive = vc.state !== 'idle' && vc.state !== 'error';
            if (isConversationActive && !isMirrorModeRef.current) {
              enterMirrorMode();
            }
          } else {
            setIsMainWindowFocused(true);
            if (isProgrammaticFocusRef.current) return;

            try {
              const { currentMonitor } = await import('@tauri-apps/api/window');
              const monitor = await currentMonitor();
              if (monitor) activeMonitorRef.current = monitor as any;
            } catch {
              /* ignore */
            }

            if (isMirrorModeRef.current) {
              exitMirrorMode(false);
            }

            refreshMessages();

            const vc = voiceConvRef.current;
            const isConversationActive = vc.state !== 'idle' && vc.state !== 'error';
            if (!isConversationActive) {
              if (v && !v.isWakeWordListening) v.toggleListening();
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

  // Determine voice panel state
  const panelState = voiceConv.state !== 'idle' ? voiceConv.state : voice.state;
  const panelTranscript = voiceConv.state !== 'idle' ? voiceConv.finalTranscript : voice.transcript;
  const panelSupported = voiceConv.isSupported || voice.isSupported;

  const handleReconnect = useCallback(async () => {
    try {
      await jarvisClient.get('/api/health');
      setDaemonConnected(true);
    } catch {
      setDaemonConnected(false);
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    exitMirrorMode(false);
    setInitialControlPage('models');
    setActiveView('control-center');
  }, [exitMirrorMode, setActiveView]);

  // --- Mirror mode render ---
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
          onOpenSettings={handleOpenSettings}
          onRestore={() => exitMirrorMode(false)}
          layoutMode="bottom-right"
        />
        <DataPanelContainer overlay />
      </>
    );
  }

  // --- Control Center render ---
  if (activeView === 'control-center') {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <ControlCenter
            onBack={() => setActiveView('assistant')}
            initialPage={initialControlPage}
          />
        </div>
      </div>
    );
  }

  // --- Main shell render ---
  const voicePanelState = {
    state: panelState,
    transcript: panelTranscript,
    isSupported: panelSupported,
    isWakeWordListening: voice.isWakeWordListening,
    wakeWordMethod: voice.wakeWordMethod,
    wakeWordError: voice.wakeWordError,
    interimTranscript: voiceConv.interimTranscript,
    assistantText: voiceConv.assistantText,
    onToggle: handleVoiceToggle,
    onBargeIn: voiceConv.bargeIn,
    onStop: voiceConv.stopConversation,
  };

  const renderMainContent = () => {
    switch (activeView) {
      case 'tasks':
        return <TasksView />;
      case 'runs':
        return <RunsView />;
      case 'memory':
        return <MemoryView />;
      case 'approvals':
        return <ApprovalsView />;
      case 'projects':
        return <ProjectsView />;
      case 'agents':
        return <AgentsView />;
      case 'workspace':
        return <WorkspaceView />;
      case 'assistant':
      default:
        return (
          <AssistantView
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
            voice={voicePanelState}
          />
        );
    }
  };

  const voiceOverlay = isMainWindowFocused ? (
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
      onOpenSettings={handleOpenSettings}
      layoutMode="centered"
    />
  ) : null;

  // Workspace view renders its own full layout without the global inspector pane
  if (activeView === 'workspace') {
    return (
      <div
        className="flex flex-col h-screen overflow-hidden"
        style={{ background: 'var(--bg-void)' }}
      >
        <HudDecorations />

        {!daemonConnected && <DaemonDisconnectedBanner onReconnect={handleReconnect} />}

        <TitleBar
          onSettings={() => {
            setInitialControlPage('overview');
            setActiveView('control-center');
          }}
        />

        <div className="flex flex-1 overflow-hidden relative z-10">
          <GlobalRail
            activeView={activeView}
            onViewChange={setActiveView}
            pendingApprovalCount={pendingApprovalCount}
            runningRunCount={activeRunCount}
          />
          <WorkspaceView />
        </div>

        <CommandPalette
          onChat={handlePaletteChat}
          onNavigate={handlePaletteNavigate}
          onVoiceToggle={handleVoiceToggle}
        />

        {voiceOverlay}

        <ToastContainer />
        <ShortcutsOverlay />
        <BottomStatusBar />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg-void)' }}
    >
      <HudDecorations />

      {!daemonConnected && <DaemonDisconnectedBanner onReconnect={handleReconnect} />}

      <TitleBar
        onSettings={() => {
          setInitialControlPage('overview');
          setActiveView('control-center');
        }}
      />

      <ShellLayout
        rail={
          <GlobalRail
            activeView={activeView}
            onViewChange={setActiveView}
            pendingApprovalCount={pendingApprovalCount}
            runningRunCount={activeRunCount}
          />
        }
        contextPane={undefined}
        mainSurface={renderMainContent()}
        inspector={<InspectorPane />}
      />

      <CommandPalette
        onChat={handlePaletteChat}
        onNavigate={handlePaletteNavigate}
        onVoiceToggle={handleVoiceToggle}
      />

      {voiceOverlay}

      <ToastContainer />
      <ShortcutsOverlay />
      <BottomStatusBar />
    </div>
  );
}
