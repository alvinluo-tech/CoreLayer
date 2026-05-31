interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'error' | 'idle';
  label: string;
}

const statusColors = {
  healthy: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  idle: 'bg-muted-foreground',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${statusColors[status]}`} />
      {label}
    </span>
  );
}
