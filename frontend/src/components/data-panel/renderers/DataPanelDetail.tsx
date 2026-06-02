// frontend/src/components/data-panel/renderers/DataPanelDetail.tsx
import type { DataPanelObject } from '../dataPanelTypes';
import { StatusDot, Badge, KeyValueRow } from './ui-atoms';

interface DataPanelDetailProps {
  data: DataPanelObject;
}

export function DataPanelDetail({ data }: DataPanelDetailProps) {
  if (!data || data.fields.length === 0) {
    return <div className="dp-empty">No data</div>;
  }

  const titleField = data.fields.find((f) => f.type === 'title');
  const statusField = data.fields.find((f) => f.type === 'status');
  const badgeField = data.fields.find((f) => f.type === 'badge');
  const otherFields = data.fields.filter(
    (f) => f !== titleField && f !== statusField && f !== badgeField
  );

  return (
    <div className="dp-detail">
      {titleField && (
        <div className="dp-detail-header">
          {statusField && <StatusDot status={String(statusField.value ?? '')} />}
          <span className="dp-detail-title">{String(titleField.value ?? '')}</span>
          {badgeField && <Badge label={String(badgeField.value ?? '')} />}
        </div>
      )}
      <div className="dp-detail-fields">
        {otherFields.map((field) => (
          <KeyValueRow key={field.key} label={field.label} value={field.value} type={field.type} />
        ))}
      </div>
    </div>
  );
}
