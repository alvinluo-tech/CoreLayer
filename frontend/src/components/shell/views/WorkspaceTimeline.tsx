import { useState, useMemo } from 'react';
import {
  Bot,
  Wrench,
  Brain,
  ShieldCheck,
  Settings,
  FileText,
  CheckCircle,
  XCircle,
  Beaker,
  Activity,
} from 'lucide-react';
import { mapEventsToCards, type TimelineCategory } from './workspaceTimelineModel';

interface BackendEvent {
  id: string;
  type: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

interface WorkspaceTimelineProps {
  events: BackendEvent[];
}

const filterTabs = ['All', 'Agent', 'Tool', 'Artifact', 'Verification', 'System'] as const;

const categoryIcons: Record<TimelineCategory, { icon: typeof Bot; color: string }> = {
  agent: { icon: Bot, color: 'var(--cyan)' },
  tool: { icon: Wrench, color: 'var(--emerald)' },
  memory: { icon: Brain, color: 'var(--violet)' },
  approval: { icon: ShieldCheck, color: 'var(--amber)' },
  artifact: { icon: FileText, color: 'var(--cyan)' },
  verification: { icon: Beaker, color: 'var(--emerald)' },
  system: { icon: Settings, color: 'var(--text-tertiary)' },
};

const severityIcons: Record<string, { icon: typeof CheckCircle; color: string }> = {
  success: { icon: CheckCircle, color: 'var(--emerald)' },
  error: { icon: XCircle, color: 'var(--rose)' },
  warning: { icon: ShieldCheck, color: 'var(--amber)' },
  info: { icon: Settings, color: 'var(--text-tertiary)' },
};

const defaultCategoryIcon = { icon: Settings, color: 'var(--text-tertiary)' };

function getCategoryIcon(category: TimelineCategory) {
  return categoryIcons[category] ?? defaultCategoryIcon;
}

function renderDiff(diffText: string) {
  if (!diffText || typeof diffText !== 'string') return null;
  return (
    <div
      className="timeline-diff"
      style={{
        fontFamily: 'var(--font-code, JetBrains Mono, monospace)',
        fontSize: 10,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(0,212,255,0.05)',
        borderRadius: 4,
        padding: '6px 8px',
        marginTop: 4,
        lineHeight: 1.5,
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {diffText.split('\n').map((line, idx) => {
        if (line.startsWith('+')) {
          return (
            <div key={idx} className="diff-add" style={{ color: '#00e68a' }}>
              {line}
            </div>
          );
        } else if (line.startsWith('-')) {
          return (
            <div key={idx} className="diff-del" style={{ color: '#ff3d5a' }}>
              {line}
            </div>
          );
        } else {
          return (
            <div key={idx} className="diff-ctx" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {line}
            </div>
          );
        }
      })}
    </div>
  );
}

export function WorkspaceTimeline({ events }: WorkspaceTimelineProps) {
  const [filter, setFilter] = useState<string>('All');

  // Map backend events to display cards
  const cards = mapEventsToCards(events);

  // Compute summary statistics
  const summary = useMemo(() => {
    const eventCount = cards.length;
    const artifactCount = cards.filter((c) => c.category === 'artifact').length;
    const verificationCount = cards.filter((c) => c.category === 'verification').length;
    const errorCount = cards.filter((c) => c.severity === 'error').length;

    // Find latest run status
    const runEvents = cards.filter(
      (c) => c.category === 'agent' && c.chips.some((ch) => ch.startsWith('Runtime:'))
    );
    const latestRun = runEvents[0];
    const latestRunStatus =
      latestRun?.severity === 'success'
        ? 'completed'
        : latestRun?.severity === 'error'
          ? 'failed'
          : latestRun
            ? 'running'
            : null;

    // Find last verification result
    const verificationEvents = cards.filter((c) => c.category === 'verification');
    const lastVerification = verificationEvents[0];
    const lastVerificationResult =
      lastVerification?.severity === 'success'
        ? 'passed'
        : lastVerification?.severity === 'error'
          ? 'failed'
          : null;

    return {
      eventCount,
      artifactCount,
      verificationCount,
      errorCount,
      latestRunStatus,
      lastVerificationResult,
    };
  }, [cards]);

  // Filter by category
  const filtered =
    filter === 'All' ? cards : cards.filter((c) => c.category === filter.toLowerCase());

  return (
    <div className="flex flex-col gap-2">
      {/* Flight Recorder Header */}
      {cards.length > 0 && (
        <div
          className="flex items-center gap-3 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(0,212,255,0.03)',
            border: '1px solid rgba(0,212,255,0.06)',
            fontFamily: 'var(--font-data, Share Tech Mono, monospace)',
            fontSize: 9,
          }}
        >
          <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Activity size={10} style={{ color: 'var(--cyan)' }} />
            {summary.eventCount} events
          </span>
          {summary.latestRunStatus && (
            <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background:
                    summary.latestRunStatus === 'completed'
                      ? 'var(--emerald)'
                      : summary.latestRunStatus === 'failed'
                        ? 'var(--rose)'
                        : 'var(--amber)',
                }}
              />
              Run: {summary.latestRunStatus}
            </span>
          )}
          {summary.artifactCount > 0 && (
            <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <FileText size={10} style={{ color: 'var(--cyan)' }} />
              {summary.artifactCount} artifacts
            </span>
          )}
          {summary.lastVerificationResult && (
            <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <Beaker
                size={10}
                style={{
                  color:
                    summary.lastVerificationResult === 'passed' ? 'var(--emerald)' : 'var(--rose)',
                }}
              />
              {summary.lastVerificationResult}
            </span>
          )}
          {summary.errorCount > 0 && (
            <span className="flex items-center gap-1" style={{ color: 'var(--rose)' }}>
              <XCircle size={10} />
              {summary.errorCount} errors
            </span>
          )}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {filterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`filter-chip ${filter === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex flex-col gap-0.5" style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'rgba(0,212,255,0.08)',
          }}
        />
        {filtered.length === 0 ? (
          <div
            className="flex items-center justify-center py-4"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)', fontSize: 11 }}
          >
            No events
          </div>
        ) : (
          filtered.map((card) => {
            const { icon: Icon, color } = getCategoryIcon(card.category);
            const severityInfo = severityIcons[card.severity];
            const SeverityIcon = severityInfo?.icon;

            return (
              <div key={card.id} className="timeline-event flex items-start gap-2 py-1.5 pl-0 pr-2">
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: `${color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    zIndex: 1,
                  }}
                >
                  <Icon size={12} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="timeline-msg"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {card.title}
                    </span>
                    {SeverityIcon && card.severity !== 'info' && (
                      <SeverityIcon size={10} style={{ color: severityInfo.color }} />
                    )}
                  </div>
                  {card.summary && (
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.3,
                        marginTop: 1,
                      }}
                    >
                      {card.summary}
                    </div>
                  )}
                  {card.chips.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap" style={{ marginTop: 3 }}>
                      {card.chips.map((chip, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 9,
                            color: 'var(--text-tertiary)',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 3,
                            padding: '1px 4px',
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.filePath && (
                    <div className="timeline-file flex items-center gap-1">
                      <FileText size={10} style={{ color: 'var(--emerald)' }} />
                      {card.filePath}
                    </div>
                  )}
                  {card.diffPreview && renderDiff(card.diffPreview)}
                  <div
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      marginTop: 2,
                    }}
                  >
                    {card.timestamp}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
