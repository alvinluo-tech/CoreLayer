import { useToastStore, type ToastType } from '@/stores/toastStore';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

const iconMap: Record<ToastType, { icon: React.ReactNode; color: string }> = {
  info: { icon: <Info size={14} />, color: 'var(--cyan)' },
  success: { icon: <CheckCircle size={14} />, color: 'var(--emerald)' },
  warning: { icon: <AlertTriangle size={14} />, color: 'var(--amber)' },
  error: { icon: <XCircle size={14} />, color: 'var(--rose)' },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 52,
        right: 16,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const { icon, color } = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--glass-border)',
              background: 'rgba(8,12,24,0.95)',
              backdropFilter: 'blur(20px)',
              boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
              minWidth: 260,
              maxWidth: 340,
              pointerEvents: 'auto',
              animation: 'toastIn 0.3s ease',
            }}
          >
            <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                {toast.title}
              </div>
              {toast.message && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 2,
                flexShrink: 0,
                display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
