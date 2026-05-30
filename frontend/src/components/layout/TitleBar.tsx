import React, { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    // Check if running inside Tauri
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const initWindow = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          
          // Set initial maximized state
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);

          // Listen to window resize/maximize events to keep state in sync
          unlisten = await appWindow.onResized(async () => {
            try {
              const max = await appWindow.isMaximized();
              setIsMaximized(max);
            } catch (err) {
              console.warn("Failed to check maximized state in resize listener:", err);
            }
          });
        } catch (err) {
          console.error("Failed to initialize Tauri window listeners:", err);
        }
      };

      initWindow();
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (err) {
      console.warn("Tauri minimize failed:", err);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (err) {
      console.warn("Tauri toggleMaximize failed:", err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (err) {
      console.warn("Tauri close failed:", err);
    }
  };

  return (
    <div
      className="flex items-center justify-between h-10 w-full bg-card/60 backdrop-blur-md border-b border-border select-none relative z-50 text-foreground transition-all duration-300"
    >
      {/* Left: Premium Sci-Fi Logo & App Details */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-3 px-3 h-full select-none cursor-default"
      >
        <img src="/icon.png" alt="Jarvis" className="w-5 h-5 rounded-sm" />
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tracking-[0.2em] text-foreground uppercase">
            Jarvis
          </span>
          <span className="text-[9px] font-mono text-primary/70 bg-primary/10 border border-primary/25 rounded px-1 py-0.5 uppercase tracking-wider leading-none">
            Core OS
          </span>
        </div>
      </div>

      {/* Center: Draggable Spacer with optional subtle status */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full flex items-center justify-center text-[11px] font-mono text-muted-foreground/60 tracking-widest cursor-default select-none uppercase"
      >
        <span>Command Center</span>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center h-full relative z-50">
        {/* Connection status (visual-only aesthetic pill) */}
        <div className="flex items-center gap-1.5 px-3 py-1 border-r border-border h-full text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground/80 uppercase">
            Secured
          </span>
        </div>

        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-11 h-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors duration-150 focus:outline-none"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>

        {/* Maximize / Restore Button */}
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-11 h-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors duration-150 focus:outline-none"
          title={isMaximized ? "Restore Down" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 stroke-[1.5]" />
          ) : (
            <Square className="w-3.5 h-3.5 stroke-[1.5]" />
          )}
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-full hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-all duration-150 focus:outline-none rounded-tr-md"
          title="Close"
        >
          <X className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>
      </div>
    </div>
  );
}
