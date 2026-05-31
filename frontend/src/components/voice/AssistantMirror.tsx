import { useCallback, useEffect, useState } from "react";
import { JarvisVoiceOverlay } from "./JarvisVoiceOverlay";
import type { VoiceConversationState } from "@/hooks/useVoiceConversation";
import { logger } from "@/lib/logger";

export function AssistantMirror() {
  const [mirroredState, setMirroredState] = useState<VoiceConversationState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.backgroundColor = "transparent";
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenMirror: (() => void) | null = null;

    const setupAssistantMirror = async () => {
      try {
        const { listen, emit } = await import("@tauri-apps/api/event");

        if (!active) return;

        const unsub = await listen<{
          state: VoiceConversationState;
          interimTranscript: string;
          finalTranscript: string;
          assistantText: string;
        }>("voice-state-mirror", (event) => {
          if (!active) return;
          const p = event.payload;
          logger.debug("[Assistant Window] Received voice mirror state:", p);
          setMirroredState(p.state);
          setInterimTranscript(p.interimTranscript);
          setFinalTranscript(p.finalTranscript);
          setAssistantText(p.assistantText);
        });

        if (!active) {
          try { unsub(); } catch {
            // Cleanup during teardown is best-effort
          }
          return;
        }
        unlistenMirror = unsub;
        logger.debug("[Assistant Window] Mirror listener registered. Notifying main window...");

        await emit("assistant-ready").catch(() => {});
      } catch (e) {
        logger.warn("Failed to set up assistant window mirroring:", e);
      }
    };

    setupAssistantMirror();

    return () => {
      active = false;
      if (unlistenMirror) {
        try { unlistenMirror(); } catch {
          // Cleanup during teardown is best-effort
        }
      }
    };
  }, []);

  const handleStopMirror = useCallback(async () => {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("stop-voice-from-assistant").catch(() => {});
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      await appWindow.hide().catch(() => {});
    } catch (e) {
      logger.warn("Failed to emit stop from assistant:", e);
    }
  }, []);

  const handleFinishMirror = useCallback(async () => {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("finish-voice-from-assistant").catch(() => {});
    } catch (e) {
      logger.warn("Failed to emit finish from assistant:", e);
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
      const { emit } = await import("@tauri-apps/api/event");
      await emit("open-settings-from-assistant").catch(() => {});
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      await appWindow.hide().catch(() => {});
    } catch (e) {
      logger.warn("Failed to open settings from assistant:", e);
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
