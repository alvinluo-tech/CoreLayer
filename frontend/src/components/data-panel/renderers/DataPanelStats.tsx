import { useEffect, useRef, useState } from 'react';
import type { DataViewSchema } from '@/types/dataView';

interface DataPanelStatsProps {
  data: unknown;
  schema?: DataViewSchema;
  renderHint?: { stats?: string[] };
}

function extractStatsData(
  data: unknown,
  fields?: string[]
): Array<{ label: string; value: number; unit?: string }> {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;
  const keys = fields ?? Object.keys(record);

  const stats: Array<{ label: string; value: number; unit?: string }> = [];

  for (const key of keys) {
    const val = record[key];
    if (typeof val === 'number') {
      stats.push({ label: formatLabel(key), value: val, unit: guessUnit(key) });
    } else if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
      stats.push({ label: formatLabel(key), value: Number(val) });
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Expand nested numeric objects (e.g. { byCategory: { tech: 5, science: 3 } })
      const nested = val as Record<string, unknown>;
      for (const [nKey, nVal] of Object.entries(nested)) {
        if (typeof nVal === 'number') {
          stats.push({ label: `${formatLabel(key)} · ${formatLabel(nKey)}`, value: nVal });
        }
      }
    }
  }

  return stats;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function guessUnit(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (lower.includes('rate') || lower.includes('ratio') || lower.includes('percent')) return '%';
  return undefined;
}

function AnimatedNumber({ value, unit }: { value: number; unit?: string }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 800;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  const formatted = unit === '%' ? `${display}` : display.toLocaleString();

  return (
    <span className="dp-stat-value">
      {formatted}
      {unit && <span className="dp-stat-unit">{unit}</span>}
    </span>
  );
}

export function DataPanelStats({ data, schema, renderHint }: DataPanelStatsProps) {
  const fields = renderHint?.stats ?? schema?.stats;
  const stats = extractStatsData(data, fields);

  if (stats.length === 0) {
    return <div className="dp-empty">No numeric data to display</div>;
  }

  return (
    <div className="dp-stats-grid">
      {stats.map((stat, i) => (
        <div key={stat.label} className="dp-stat-card" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="dp-stat-label">{stat.label}</div>
          <AnimatedNumber value={stat.value} unit={stat.unit} />
        </div>
      ))}
    </div>
  );
}
