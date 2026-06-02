import { X } from 'lucide-react';

interface DataPanelHeaderProps {
  title: string;
  icon?: string;
  meta?: string;
  toolName?: string;
  onClose: () => void;
}

export function DataPanelHeader({ title, icon, meta, toolName, onClose }: DataPanelHeaderProps) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  return (
    <div className="dp-header">
      <div className="dp-header-left">
        <div className="dp-header-title">
          {icon && <span className="dp-header-icon">{icon}</span>}
          <span>{title}</span>
        </div>
        {toolName && (
          <div className="dp-header-tool">
            <span className="dp-header-tool-label">[TOOL: {toolName}]</span>
            <span className="dp-header-tool-time">• {time}</span>
            <span className="dp-header-cursor">▌</span>
          </div>
        )}
      </div>
      <div className="dp-header-right">
        {meta && <span className="dp-header-meta">{meta}</span>}
        <button className="dp-close-btn" onClick={onClose} aria-label="Close panel">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
