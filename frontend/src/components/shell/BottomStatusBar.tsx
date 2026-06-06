import { useConversationStore } from '@/stores/conversationStore';

/**
 * Fixed bottom status bar showing version, tech stack, and session info.
 */
export function BottomStatusBar() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId);

  return (
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
  );
}
