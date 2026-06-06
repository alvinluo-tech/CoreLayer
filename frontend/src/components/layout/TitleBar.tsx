import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [clock, setClock] = useState('');

  // Real-time clock (HUD style: HH:MM:SS)
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Tauri window state listener
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const initWindow = async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const appWindow = getCurrentWindow();

          const maximized = await appWindow.isMaximized();
          if (!active) return;
          setIsMaximized(maximized);

          const unsub = await appWindow.onResized(async () => {
            if (!active) return;
            try {
              const max = await appWindow.isMaximized();
              setIsMaximized(max);
            } catch {
              /* ignore */
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
        } catch {
          /* ignore */
        }
      };

      initWindow();
    }

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
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      /* ignore */
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch {
      /* ignore */
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="relative z-50 flex items-center justify-between select-none"
      style={{
        height: 42,
        background: 'rgba(4,6,14,0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      {/* Bottom glow line — Holo only (hidden in Focus via CSS) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px hud-glow-line"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--cyan-glow), var(--cyan-dim), var(--cyan-glow), transparent)',
        }}
      />

      {/* Left: Logo + Status */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-3.5 px-5 h-full select-none cursor-default"
      >
        {/* Logo icon */}
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full"
          style={{
            border: '1px solid var(--cyan-dim)',
            animation: 'logoPulse 3s ease-in-out infinite',
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: 'var(--cyan)', boxShadow: '0 0 12px var(--cyan-dim)' }}
          />
        </div>

        {/* App name */}
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 3,
            color: 'var(--cyan)',
            textShadow: '0 0 20px var(--cyan-glow), 0 0 40px rgba(0,212,255,0.05)',
          }}
        >
          JARVIS
        </span>

        {/* Separator */}
        <div
          className="h-5"
          style={{
            width: 1,
            background: 'linear-gradient(180deg, transparent, var(--cyan-dim), transparent)',
          }}
        />

        {/* Status dots */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--emerald)', boxShadow: '0 0 6px var(--emerald-glow)' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: 1,
                color: 'var(--text-secondary)',
              }}
            >
              SYSTEMS
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--emerald)', boxShadow: '0 0 6px var(--emerald-glow)' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: 1,
                color: 'var(--text-secondary)',
              }}
            >
              AI CORE
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--amber)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                letterSpacing: 1,
                color: 'var(--text-tertiary)',
              }}
            >
              MCP
            </span>
          </div>
        </div>
      </div>

      {/* Center: draggable area */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* Right: Clock + Controls */}
      <div className="flex items-center gap-3 px-4 h-full relative z-50">
        {/* Clock */}
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--cyan-dim)',
            letterSpacing: 2,
          }}
        >
          {clock}
        </span>

        {/* Separator */}
        <div
          className="h-4"
          style={{
            width: 1,
            background: 'linear-gradient(180deg, transparent, var(--glass-border), transparent)',
          }}
        />

        {/* Window controls */}
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-7 h-7 rounded transition-all duration-150"
          style={{
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--cyan)';
            e.currentTarget.style.color = 'var(--cyan)';
            e.currentTarget.style.boxShadow = '0 0 12px var(--cyan-glow)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          title="Minimize"
        >
          <Minus className="w-3 h-3 stroke-[1.5]" />
        </button>

        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-7 h-7 rounded transition-all duration-150"
          style={{
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--cyan)';
            e.currentTarget.style.color = 'var(--cyan)';
            e.currentTarget.style.boxShadow = '0 0 12px var(--cyan-glow)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          title={isMaximized ? 'Restore Down' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 stroke-[1.5]" />
          ) : (
            <Square className="w-3 h-3 stroke-[1.5]" />
          )}
        </button>

        <button
          onClick={handleClose}
          className="flex items-center justify-center w-7 h-7 rounded transition-all duration-150"
          style={{
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--rose)';
            e.currentTarget.style.color = 'var(--rose)';
            e.currentTarget.style.boxShadow = '0 0 12px var(--rose-glow)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          title="Close"
        >
          <X className="w-3 h-3 stroke-[1.5]" />
        </button>
      </div>
    </div>
  );
}
