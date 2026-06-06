import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: { label: string; keys: string[] }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { label: 'New conversation', keys: ['Ctrl', 'N'] },
      { label: 'Switch conversation', keys: ['Ctrl', '1-9'] },
      { label: 'Focus input', keys: ['Ctrl', '/'] },
      { label: 'Command palette', keys: ['Alt', 'Space'] },
    ],
  },
  {
    title: 'Interface',
    shortcuts: [
      { label: 'Toggle Focus / Holo', keys: ['Ctrl', '.'] },
      { label: 'Toggle Settings view', keys: ['Ctrl', ','] },
      { label: 'Show shortcuts', keys: ['?'] },
      { label: 'Close overlay / menu', keys: ['Esc'] },
    ],
  },
  {
    title: 'Commands',
    shortcuts: [
      { label: 'Slash commands', keys: ['/'] },
      { label: 'Reference data', keys: ['@'] },
      { label: 'Send message', keys: ['Enter'] },
      { label: 'New line in input', keys: ['Shift', 'Enter'] },
    ],
  },
];

export function ShortcutsOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          return;
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div
        style={{
          width: 480,
          maxHeight: '80vh',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--glass-border)',
          background: 'rgba(8,12,24,0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(0,212,255,0.05)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            Keyboard Shortcuts
          </span>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-bg)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(80vh - 60px)' }}>
          {shortcutGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: 'var(--font-hud)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 2,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {group.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {shortcut.label}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {shortcut.keys.map((key) => (
                        <span
                          key={key}
                          style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            letterSpacing: 0.5,
                            padding: '2px 8px',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 4,
                            background: 'rgba(0,0,0,0.2)',
                          }}
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
