interface StatusPillProps {
  label: string;
  color: string;
  pulse?: boolean;
}

export function StatusPill({ label, color, pulse }: StatusPillProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: pulse ? `0 0 6px ${color}` : 'none',
          animation: pulse ? 'pulse 2s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
    </span>
  );
}
