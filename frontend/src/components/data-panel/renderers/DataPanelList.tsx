import type { DataViewSchema } from '@/types/dataView';
import { STATUS_COLORS } from '@/types/dataView';

interface DataPanelListProps {
  data: unknown[];
  schema?: DataViewSchema;
}

function getValue(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return (obj as Record<string, unknown>)[path];
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number') return 0;
  return value > 1 ? Math.min(value, 100) : value * 100;
}

export function DataPanelList({ data, schema }: DataPanelListProps) {
  const shape = schema?.itemShape;

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="dp-empty">No data</div>;
  }

  const grouped = schema?.groupBy ? groupItems(data, schema.groupBy) : null;

  if (grouped) {
    return (
      <div className="dp-list">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div className="dp-item-secondary" style={{ padding: '4px 0', fontWeight: 600 }}>
              {group} ({items.length})
            </div>
            <div className="dp-divider" />
            {items.map((item, i) => (
              <ListItem key={i} item={item} shape={shape} index={i} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dp-list">
      {data.map((item, i) => (
        <ListItem key={i} item={item} shape={shape} index={i} />
      ))}
    </div>
  );
}

function ListItem({
  item,
  shape,
  index,
}: {
  item: unknown;
  shape?: DataViewSchema['itemShape'];
  index: number;
}) {
  if (typeof item !== 'object' || item === null) {
    return (
      <div className="dp-list-item" style={{ animationDelay: `${index * 50}ms` }}>
        <span className="dp-item-primary">{String(item)}</span>
      </div>
    );
  }

  const primary = shape?.primary
    ? String(getValue(item, shape.primary) ?? '')
    : JSON.stringify(item);
  const secondary = shape?.secondary ? String(getValue(item, shape.secondary) ?? '') : undefined;
  const badge = shape?.badge ? getValue(item, shape.badge) : undefined;
  const status = shape?.status ? String(getValue(item, shape.status) ?? '') : undefined;
  const progress = shape?.progress ? normalizeProgress(getValue(item, shape.progress)) : undefined;

  return (
    <div className="dp-list-item" style={{ animationDelay: `${index * 50}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {status && (
          <span
            className="dp-item-status"
            style={{
              backgroundColor: STATUS_COLORS[status.toLowerCase()] ?? STATUS_COLORS.pending,
            }}
          />
        )}
        <span className="dp-item-primary">{primary}</span>
        {badge != null && <span className="dp-item-badge">{String(badge)}</span>}
      </div>
      {secondary && <div className="dp-item-secondary">{secondary}</div>}
      {progress != null && (
        <div className="dp-item-progress">
          <div className="dp-item-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function groupItems(data: unknown[], field: string): Record<string, unknown[]> {
  const groups: Record<string, unknown[]> = {};
  for (const item of data) {
    const key = String(getValue(item, field) ?? 'Other');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
