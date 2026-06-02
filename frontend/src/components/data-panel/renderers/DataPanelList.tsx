import type { DataViewSchema } from '@/types/dataView';
import { STATUS_COLORS } from '@/types/dataView';

interface DataPanelListProps {
  data: unknown[];
  schema?: DataViewSchema;
  density?: 'detailed' | 'compact' | 'grid';
}

function getValue(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  return (obj as Record<string, unknown>)[path];
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number') return 0;
  return value > 1 ? Math.min(value, 100) : value * 100;
}

export function DataPanelList({ data, schema, density }: DataPanelListProps) {
  const shape = schema?.itemShape ?? autoDetectShape(data);
  const effectiveDensity = density ?? (data.length <= 3 ? 'detailed' : 'compact');

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

  if (effectiveDensity === 'detailed') {
    return (
      <div className="dp-list dp-list-detailed">
        {data.map((item, i) => (
          <DetailedListItem key={i} item={item} shape={shape} index={i} />
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

function DetailedListItem({
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
      <div
        className="dp-list-item dp-list-item-detailed"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <span className="dp-item-primary">{String(item)}</span>
      </div>
    );
  }

  const obj = item as Record<string, unknown>;
  const primary = shape?.primary
    ? String(getValue(item, shape.primary) ?? '')
    : JSON.stringify(item);
  const secondary = shape?.secondary ? String(getValue(item, shape.secondary) ?? '') : undefined;
  const status = shape?.status ? String(getValue(item, shape.status) ?? '') : undefined;
  const badge = shape?.badge ? getValue(item, shape.badge) : undefined;

  // Show all non-skipped fields as key-value pairs
  const SKIP = ['id', 'userId', 'createdAt', 'updatedAt', 'completedAt'];
  const detailFields = Object.entries(obj).filter(
    ([k]) =>
      !SKIP.includes(k) &&
      k !== shape?.primary &&
      k !== shape?.secondary &&
      k !== shape?.status &&
      k !== shape?.badge
  );

  return (
    <div
      className="dp-list-item dp-list-item-detailed"
      style={{ animationDelay: `${index * 50}ms` }}
    >
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
      {detailFields.length > 0 && (
        <div className="dp-item-details">
          {detailFields.map(([key, val]) => (
            <div key={key} className="dp-item-detail-row">
              <span className="dp-item-detail-key">{key}:</span>
              <span className="dp-item-detail-val">{String(val ?? '—')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function autoDetectShape(data: unknown[]): DataViewSchema['itemShape'] | undefined {
  if (!data.length || typeof data[0] !== 'object' || data[0] === null) return undefined;
  const first = data[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  if (keys.length === 0) return undefined;

  const STATUS_KEYS = ['status', 'state', 'phase'];
  const BADGE_KEYS = ['priority', 'level', 'rank', 'type', 'category'];
  const SKIP_KEYS = [
    'id',
    'userid',
    'user_id',
    'createdat',
    'updatedat',
    'completedat',
    'created_at',
    'updated_at',
    'completed_at',
  ];
  const PRIMARY_PREFS = ['title', 'name', 'label', 'subject', 'headline', 'summary'];

  const statusKey = keys.find((k) => STATUS_KEYS.includes(k.toLowerCase()));
  const badgeKey = keys.find((k) => BADGE_KEYS.includes(k.toLowerCase()));

  const displayKeys = keys.filter((k) => {
    const lower = k.toLowerCase();
    return (
      typeof first[k] === 'string' &&
      !STATUS_KEYS.includes(lower) &&
      !BADGE_KEYS.includes(lower) &&
      !SKIP_KEYS.includes(lower)
    );
  });

  const primary =
    PRIMARY_PREFS.find((p) => displayKeys.includes(p)) ?? displayKeys[0] ?? keys[0] ?? 'item';
  const secondary = displayKeys.find((k) => k !== primary);

  return {
    primary,
    secondary,
    status: statusKey,
    badge: badgeKey,
  };
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
