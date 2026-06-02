import { X } from 'lucide-react';

interface DataPanelHeaderProps {
  title: string;
  icon?: string;
  meta?: string;
  onClose: () => void;
}

export function DataPanelHeader({ title, icon, meta, onClose }: DataPanelHeaderProps) {
  return (
    <div className="dp-header">
      <div className="dp-header-title">
        {icon && <span className="dp-header-icon">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {meta && <span className="dp-header-meta">{meta}</span>}
        <button className="dp-close-btn" onClick={onClose} aria-label="Close panel">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
