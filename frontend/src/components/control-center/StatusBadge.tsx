interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'error' | 'idle';
  label: string;
}

const statusStyles: Record<
  StatusBadgeProps['status'],
  { color: string; bg: string; border: string }
> = {
  healthy: {
    color: 'var(--emerald)',
    bg: 'rgba(0,230,138,0.08)',
    border: 'rgba(0,230,138,0.15)',
  },
  warning: {
    color: 'var(--amber)',
    bg: 'rgba(255,184,0,0.08)',
    border: 'rgba(255,184,0,0.15)',
  },
  error: {
    color: 'var(--rose)',
    bg: 'rgba(255,61,90,0.08)',
    border: 'rgba(255,61,90,0.15)',
  },
  idle: {
    color: 'var(--text-tertiary)',
    bg: 'rgba(255,255,255,0.03)',
    border: 'var(--glass-border)',
  },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]"
      style={{
        fontFamily: 'var(--font-data)',
        letterSpacing: 0.5,
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.color }} />
      {label}
    </span>
  );
}
