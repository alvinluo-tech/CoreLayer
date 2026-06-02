import { useState } from 'react';
import { STATUS_COLORS } from '@/types/dataView';

// --- StatusDot ---
export function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status.toLowerCase()] ?? STATUS_COLORS.pending;
  return <span className="dp-item-status" style={{ backgroundColor: color }} />;
}

// --- Badge ---
export function Badge({ label, variant }: { label: string; variant?: string }) {
  return <span className={`dp-item-badge${variant ? ` dp-badge-${variant}` : ''}`}>{label}</span>;
}

// --- StatValue (animated number) ---
export function StatValue({ value, unit }: { value: number; unit?: string }) {
  const [display] = useState(value);
  const formatted = unit === '%' ? `${display}` : display.toLocaleString();
  return (
    <span className="dp-stat-value">
      {formatted}
      {unit && <span className="dp-stat-unit">{unit}</span>}
    </span>
  );
}

// --- KeyValueRow ---
export function KeyValueRow({
  label,
  value,
  type,
}: {
  label: string;
  value: unknown;
  type: string;
}) {
  const rendered = renderFieldValue(value, type);
  return (
    <div className="dp-kv-row">
      <span className="dp-kv-label">{label}</span>
      <span className="dp-kv-value">{rendered}</span>
    </div>
  );
}

// --- SectionHeader ---
export function SectionHeader({
  label,
  count,
  defaultOpen = true,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dp-section-header" onClick={() => setOpen(!open)}>
      <span className="dp-section-chevron">{open ? '▾' : '▸'}</span>
      <span className="dp-section-label">{label}</span>
      {count != null && <span className="dp-section-count">{count}</span>}
    </div>
  );
}

// --- TimeLabel ---
export function TimeLabel({ value }: { value: string }) {
  try {
    const date = new Date(value);
    const formatted = date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return <span className="dp-time-label">⏱ {formatted}</span>;
  } catch {
    return <span className="dp-kv-value">{value}</span>;
  }
}

// --- LinkCard ---
export function LinkCard({ url }: { url: string }) {
  const safe = url.startsWith('http://') || url.startsWith('https://');
  if (!safe) return <span className="dp-kv-value">{url}</span>;

  let display: string;
  try {
    display = new URL(url).hostname;
  } catch {
    display = url.slice(0, 40);
  }

  return (
    <a className="dp-link-card" href={url} target="_blank" rel="noopener noreferrer">
      🔗 {display}
    </a>
  );
}

// --- TypeIcon ---
const TYPE_ICONS: Record<string, string> = {
  title: 'Aa',
  text: 'Aa',
  number: '#',
  boolean: '◉',
  date: '⏱',
  url: '🔗',
  status: '◉',
  badge: '▪',
  object: '{}',
  array: '[]',
  null: '—',
};

export function TypeIcon({ type }: { type: string }) {
  return <span className="dp-type-icon">{TYPE_ICONS[type] ?? '?'}</span>;
}

// --- Field value renderer ---
function renderFieldValue(value: unknown, type: string): React.ReactNode {
  if (value == null) return <span className="dp-null">—</span>;
  switch (type) {
    case 'boolean':
      return value ? <StatusDot status="done" /> : <StatusDot status="pending" />;
    case 'url':
      return <LinkCard url={String(value)} />;
    case 'date':
      return <TimeLabel value={String(value)} />;
    case 'number':
      return <span className="dp-number">{String(value)}</span>;
    case 'status':
      return (
        <>
          <StatusDot status={String(value)} />
          <span>{String(value)}</span>
        </>
      );
    case 'array':
      return <span className="dp-kv-value">{`[${(value as unknown[]).length} items]`}</span>;
    case 'object':
      return <span className="dp-kv-value">{`{...}`}</span>;
    default:
      return <span className="dp-kv-value">{String(value)}</span>;
  }
}
