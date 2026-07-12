interface StatusDotProps {
  status: 'online' | 'offline' | 'unconfigured';
  label?: boolean;
}

const STATUS_MAP = {
  online: {
    color: 'bg-emerald-500',
    ring: 'ring-emerald-500/30',
    text: '在线',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  offline: {
    color: 'bg-rose-500',
    ring: 'ring-rose-500/30',
    text: '离线',
    textColor: 'text-rose-500 dark:text-rose-400',
  },
  unconfigured: {
    color: 'bg-muted-foreground/40',
    ring: 'ring-muted-foreground/20',
    text: '未配置',
    textColor: 'text-muted-foreground',
  },
} as const;

export function StatusDot({ status, label = true }: StatusDotProps) {
  const s = STATUS_MAP[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ring-2 ${s.color} ${s.ring}`} aria-hidden />
      {label && <span className={`text-[11px] font-medium ${s.textColor}`}>{s.text}</span>}
    </span>
  );
}
