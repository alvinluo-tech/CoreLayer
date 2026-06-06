import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Icon size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          {message}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
