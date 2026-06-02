// frontend/src/components/data-panel/renderers/AdaptiveRenderer.tsx
import type { DataPanelField, DensityMode } from '../dataPanelTypes';
import { StatusDot, Badge, KeyValueRow, SectionHeader, TypeIcon } from './ui-atoms';

interface AdaptiveRendererProps {
  fields: DataPanelField[];
  density: DensityMode;
}

export function AdaptiveRenderer({ fields, density }: AdaptiveRendererProps) {
  if (!fields || fields.length === 0) {
    return <div className="dp-empty">No data to display</div>;
  }

  if (density === 'grid') {
    return <AdaptiveGrid fields={fields} />;
  }

  return (
    <div className="dp-adaptive">
      {fields.map((field, i) => (
        <AdaptiveField key={field.key} field={field} index={i} density={density} />
      ))}
    </div>
  );
}

function AdaptiveField({
  field,
  index,
  density,
}: {
  field: DataPanelField;
  index: number;
  density: DensityMode;
}) {
  // Low confidence → generic key-value
  if (field.confidence < 0.6) {
    return (
      <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
        <KeyValueRow label={field.label} value={field.value} type="text" />
      </div>
    );
  }

  // High confidence → specialized rendering
  switch (field.type) {
    case 'title':
      return (
        <div className="dp-adaptive-title" style={{ animationDelay: `${index * 50}ms` }}>
          {String(field.value ?? '')}
        </div>
      );

    case 'status':
      return (
        <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
          <StatusDot status={String(field.value ?? '')} />
          <span className="dp-item-primary">
            {field.label}: {String(field.value ?? '')}
          </span>
        </div>
      );

    case 'badge':
      return (
        <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
          <Badge label={String(field.value ?? '')} />
          <span className="dp-item-secondary">{field.label}</span>
        </div>
      );

    case 'boolean':
      return (
        <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
          <StatusDot status={field.value ? 'done' : 'pending'} />
          <span className="dp-item-primary">{field.label}</span>
        </div>
      );

    case 'object':
      return (
        <div className="dp-adaptive-section" style={{ animationDelay: `${index * 50}ms` }}>
          <SectionHeader label={field.label} count={Object.keys(field.value as object).length} />
          <div className="dp-adaptive-nested">
            <AdaptiveRenderer
              fields={objectToFields(field.value as Record<string, unknown>)}
              density={density}
            />
          </div>
        </div>
      );

    case 'array':
      return (
        <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
          <SectionHeader
            label={field.label}
            count={(field.value as unknown[]).length}
            defaultOpen={false}
          />
          <div className="dp-adaptive-tags">
            {(field.value as unknown[]).slice(0, 20).map((item, i) => (
              <span key={i} className="dp-tag">
                {String(item ?? '')}
              </span>
            ))}
            {(field.value as unknown[]).length > 20 && (
              <span className="dp-tag dp-tag-more">
                +{(field.value as unknown[]).length - 20} more
              </span>
            )}
          </div>
        </div>
      );

    default:
      return (
        <div className="dp-adaptive-field" style={{ animationDelay: `${index * 50}ms` }}>
          <KeyValueRow label={field.label} value={field.value} type={field.type} />
        </div>
      );
  }
}

function AdaptiveGrid({ fields }: { fields: DataPanelField[] }) {
  const titleField = fields.find((f) => f.type === 'title');
  const otherFields = fields.filter((f) => f !== titleField);

  return (
    <div className="dp-adaptive-grid">
      {titleField && <div className="dp-grid-title">{String(titleField.value ?? '')}</div>}
      {otherFields.slice(0, 12).map((field) => (
        <div key={field.key} className="dp-grid-cell">
          <TypeIcon type={field.type} />
          <span className="dp-grid-value">{String(field.value ?? '—')}</span>
        </div>
      ))}
    </div>
  );
}

function objectToFields(obj: Record<string, unknown>): DataPanelField[] {
  return Object.entries(obj).map(([key, value]) => ({
    key,
    label: key.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase()),
    value,
    type: guessType(value),
    confidence: 0.7,
  }));
}

function guessType(value: unknown): DataPanelField['type'] {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'date';
    if (/^https?:\/\//.test(value)) return 'url';
    return 'text';
  }
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'text';
}
