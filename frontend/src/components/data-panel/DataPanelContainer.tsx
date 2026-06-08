// frontend/src/components/data-panel/DataPanelContainer.tsx
import { useEffect, useState, useCallback } from 'react';
import { useDataPanelStore, type DataPanelEntry } from '@/stores/dataPanelStore';
import { normalizeDataPanelPayload } from './normalizeDataPanelPayload';
import { resolveRenderer } from './resolveRenderer';
import { DataPanelHeader } from './DataPanelHeader';
import { DataPanelList } from './renderers/DataPanelList';
import { DataPanelStats } from './renderers/DataPanelStats';
import { DataPanelDetail } from './renderers/DataPanelDetail';
import { AdaptiveRenderer } from './renderers/AdaptiveRenderer';
import { DataPanelChart } from './renderers/DataPanelChart';
import { GenericJSON } from './renderers/GenericJSON';
import type { DataPanelViewModel } from './dataPanelTypes';
import './data-panel.css';

const AUTO_DISMISS_MS = 30_000;
const TIMER_TICK_MS = 1_000;

interface DataPanelContainerProps {
  /** When true, renders as a fullscreen overlay (for mirror mode). */
  overlay?: boolean;
}

export function DataPanelContainer({ overlay }: DataPanelContainerProps) {
  const { entries, activeId, isVisible, dismiss } = useDataPanelStore();
  const activeEntry = entries.find((e) => e.id === activeId) ?? null;

  if (overlay) {
    return <DataPanelOverlay entry={activeEntry} isVisible={isVisible} onDismiss={dismiss} />;
  }

  return <DataPanelFloat entry={activeEntry} isVisible={isVisible} onDismiss={dismiss} />;
}

interface DataPanelViewProps {
  entry: DataPanelEntry | null;
  isVisible: boolean;
  onDismiss: () => void;
}

/** Fullscreen overlay variant for mirror mode — centered on screen. */
function DataPanelOverlay({ entry, isVisible, onDismiss }: DataPanelViewProps) {
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000);
  const [isDismissing, setIsDismissing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!isVisible || !entry) return;

    setRemaining(AUTO_DISMISS_MS / 1000);
    setShowDebug(false);
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          return 0;
        }
        return r - 1;
      });
    }, TIMER_TICK_MS);

    const timeout = setTimeout(() => {
      setIsDismissing(true);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isVisible, entry?.id, onDismiss]);

  const handleClose = useCallback(() => {
    setIsDismissing(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  useEffect(() => {
    setIsDismissing(false);
  }, [entry?.id]);

  if (!entry || !isVisible) return null;

  const viewModel = normalizeDataPanelPayload({
    toolName: entry.toolName,
    data: entry.data,
  });

  const resolved = resolveRenderer({
    data: entry.data,
    schema: entry.schema,
    renderHint: entry.renderHint,
    viewModel,
  });

  const renderData = resolved.data ?? entry.data;

  return (
    <div className="dp-mirror-overlay">
      <div className={`dp-container dp-mirror-panel${isDismissing ? ' dp-dismissed' : ''}`}>
        <DataPanelHeader
          title={resolved.title ?? entry.title}
          icon={getIcon(resolved.type)}
          meta={viewModel.subtitle}
          toolName={entry.toolName}
          onClose={handleClose}
        />
        <div className="dp-content">
          {renderContent(resolved.type, renderData, entry.schema, entry.renderHint, viewModel)}
        </div>
        {viewModel.raw != null && (
          <div className="dp-debug-section">
            <button className="dp-debug-toggle" onClick={() => setShowDebug(!showDebug)}>
              {showDebug ? '▾' : '▸'} View raw payload
            </button>
            {showDebug && <GenericJSON data={viewModel.raw} />}
          </div>
        )}
        <div className="dp-footer">
          <span>auto-dismiss</span>
          <span className="dp-timer">{remaining}s</span>
        </div>
      </div>
    </div>
  );
}

/** Inline float variant for normal mode — slides in from the right. */
function DataPanelFloat({ entry, isVisible, onDismiss }: DataPanelViewProps) {
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000);
  const [isDismissing, setIsDismissing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!isVisible || !entry) return;

    setRemaining(AUTO_DISMISS_MS / 1000);
    setShowDebug(false);
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          return 0;
        }
        return r - 1;
      });
    }, TIMER_TICK_MS);

    const timeout = setTimeout(() => {
      setIsDismissing(true);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isVisible, entry?.id, onDismiss]);

  const handleClose = useCallback(() => {
    setIsDismissing(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  useEffect(() => {
    setIsDismissing(false);
  }, [entry?.id]);

  if (!entry || !isVisible) {
    return (
      <div className="dp-empty-state">
        <div className="dp-empty-icon">◇</div>
        <p className="dp-empty-title">NO ACTIVE DATA</p>
        <p className="dp-empty-desc">Tool results will appear here</p>
      </div>
    );
  }

  // Normalize raw data into ViewModel
  const viewModel = normalizeDataPanelPayload({
    toolName: entry.toolName,
    data: entry.data,
  });

  const resolved = resolveRenderer({
    data: entry.data,
    schema: entry.schema,
    renderHint: entry.renderHint,
    viewModel,
  });

  const renderData = resolved.data ?? entry.data;

  return (
    <div className={`dp-container${isDismissing ? ' dp-dismissed' : ''}`}>
      <DataPanelHeader
        title={resolved.title ?? entry.title}
        icon={getIcon(resolved.type)}
        meta={viewModel.subtitle}
        toolName={entry.toolName}
        onClose={handleClose}
      />
      <div className="dp-content">
        {renderContent(resolved.type, renderData, entry.schema, entry.renderHint, viewModel)}
      </div>
      {viewModel.raw != null && (
        <div className="dp-debug-section">
          <button className="dp-debug-toggle" onClick={() => setShowDebug(!showDebug)}>
            {showDebug ? '▾' : '▸'} View raw payload
          </button>
          {showDebug && <GenericJSON data={viewModel.raw} />}
        </div>
      )}
      <div className="dp-footer">
        <span>auto-dismiss</span>
        <span className="dp-timer">{remaining}s</span>
      </div>
    </div>
  );
}

import type { DataViewType } from '@/types/dataView';

function getIcon(type: DataViewType | 'generic' | 'detail' | 'adaptive'): string {
  switch (type) {
    case 'list':
      return '≡';
    case 'stats':
      return '◆';
    case 'detail':
      return '☰';
    case 'table':
      return '▦';
    case 'timeline':
      return '⏱';
    case 'chart':
      return '◆';
    case 'adaptive':
      return '◇';
    default:
      return '◇';
  }
}

function renderContent(
  type: DataViewType | 'generic' | 'detail' | 'adaptive',
  data: unknown,
  schema?: DataPanelEntry['schema'],
  renderHint?: DataPanelEntry['renderHint'],
  viewModel?: DataPanelViewModel
) {
  switch (type) {
    case 'list':
      return <DataPanelList data={Array.isArray(data) ? data : []} schema={schema} />;
    case 'stats':
      return <DataPanelStats data={data} schema={schema} renderHint={renderHint} />;
    case 'detail':
      return viewModel?.detail ? (
        <DataPanelDetail data={viewModel.detail} />
      ) : (
        <GenericJSON data={data} />
      );
    case 'chart':
      return <DataPanelChart data={data} schema={schema} />;
    case 'adaptive':
      return viewModel?.detail?.fields ? (
        <AdaptiveRenderer fields={viewModel.detail.fields} density={viewModel.density} />
      ) : (
        <GenericJSON data={data} />
      );
    case 'generic':
    default:
      return <GenericJSON data={data} />;
  }
}
