interface MetricCellProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}

export function MetricCell({ icon, value, label }: MetricCellProps) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'var(--text-tertiary)' }}>{icon}</span>
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
