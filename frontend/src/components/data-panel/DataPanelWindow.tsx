// frontend/src/components/data-panel/DataPanelWindow.tsx
// Standalone data panel rendered in a dedicated Tauri window (mirror mode).
import { useEffect, useState, useCallback, useRef } from 'react';
import type { DataPanelEntry } from '@/stores/dataPanelStore';
import { normalizeDataPanelPayload } from './normalizeDataPanelPayload';
import { resolveRenderer } from './resolveRenderer';
import { DataPanelHeader } from './DataPanelHeader';
import { DataPanelList } from './renderers/DataPanelList';
import { DataPanelStats } from './renderers/DataPanelStats';
import { DataPanelDetail } from './renderers/DataPanelDetail';
import { AdaptiveRenderer } from './renderers/AdaptiveRenderer';
import { GenericJSON } from './renderers/GenericJSON';
import type { DataPanelViewModel } from './dataPanelTypes';
import type { DataViewType } from '@/types/dataView';
import './data-panel.css';

const AUTO_DISMISS_MS = 30_000;
const TIMER_TICK_MS = 1_000;

export function DataPanelWindow() {
  const [entry, setEntry] = useState<DataPanelEntry | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000);
  const [showDebug, setShowDebug] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set transparent background and signal readiness
  useEffect(() => {
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Notify main window that this window is ready to receive data
    import('@tauri-apps/api/event').then(({ emit }) => emit('data-panel-ready')).catch(() => {});
  }, []);

  // Listen for data-panel-entry events
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsub = await listen<DataPanelEntry>('data-panel-entry', (event) => {
          if (!active) return;
          setEntry(event.payload);
          setIsDismissing(false);
          setShowDebug(false);
        });
        if (!active) {
          unsub();
          return;
        }
        unlisten = unsub;
      } catch (e) {
        console.warn('[DataPanelWindow] Failed to listen for events:', e);
      }
    };

    setup();
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    if (!entry) return;

    setRemaining(AUTO_DISMISS_MS / 1000);

    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (tickRef.current) clearInterval(tickRef.current);
          return 0;
        }
        return r - 1;
      });
    }, TIMER_TICK_MS);

    dismissTimerRef.current = setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(async () => {
    setIsDismissing(true);
    if (tickRef.current) clearInterval(tickRef.current);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setTimeout(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow()
          .hide()
          .catch(() => {});
      } catch {
        // Not in Tauri
      }
      setEntry(null);
      setIsDismissing(false);
    }, 300);
  }, []);

  if (!entry) {
    return (
      <div className="dp-window-root">
        <div className="dp-empty">No data</div>
      </div>
    );
  }

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
    <div className="dp-window-root">
      <div className={`dp-container${isDismissing ? ' dp-dismissed' : ''}`}>
        <DataPanelHeader
          title={resolved.title ?? entry.title}
          icon={getIcon(resolved.type)}
          meta={viewModel.subtitle}
          toolName={entry.toolName}
          onClose={handleDismiss}
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
