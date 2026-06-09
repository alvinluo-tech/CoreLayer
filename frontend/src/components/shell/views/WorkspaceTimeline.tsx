import { useState } from 'react';
import { Bot, Wrench, Brain, ShieldCheck, Settings } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  agentName?: string;
  payload?: unknown;
}

interface WorkspaceTimelineProps {
  events: TimelineEvent[];
}

const filterTabs = ['All', 'Agent', 'Tool', 'Memory', 'Approval', 'System'] as const;

const typeIcons: Record<string, { icon: typeof Bot; color: string }> = {
  agent: { icon: Bot, color: 'var(--cyan)' },
  tool: { icon: Wrench, color: 'var(--emerald)' },
  memory: { icon: Brain, color: 'var(--violet)' },
  approval: { icon: ShieldCheck, color: 'var(--amber)' },
  system: { icon: Settings, color: 'var(--text-tertiary)' },
};

const defaultTypeIcon = { icon: Settings, color: 'var(--text-tertiary)' };

function getTypeIcon(type: string) {
  return typeIcons[type] ?? defaultTypeIcon;
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

  const filtered =
    filter === 'All' ? events : events.filter((e) => e.type === filter.toLowerCase());

  return (
    <div className="flex flex-col gap-2">
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
          filtered.map((event) => {
            const { icon: Icon, color } = getTypeIcon(event.type);

            // Parse payload for extra file & diff fields
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let payload: any = null;
            if (event.payload) {
              if (typeof event.payload === 'string') {
                try {
                  payload = JSON.parse(event.payload);
                } catch (e) {
                  void e;
                }
              } else {
                payload = event.payload;
              }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const file =
              (payload as any)?.file ||
              (payload as any)?.path ||
              (payload as any)?.args?.path ||
              (payload as any)?.args?.filepath ||
              (payload as any)?.filepath;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const diff =
              (payload as any)?.diff ||
              (payload as any)?.patch ||
              (payload as any)?.result?.diff ||
              (payload as any)?.args?.content;

            return (
              <div
                key={event.id}
                className="timeline-event flex items-start gap-2 py-1.5 pl-0 pr-2"
              >
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
                  <div
                    className="timeline-msg"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                    dangerouslySetInnerHTML={{ __html: event.message }}
                  />
                  {file && <div className="timeline-file">📄 {file}</div>}
                  {diff && renderDiff(diff)}
                  <div
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      marginTop: 2,
                    }}
                  >
                    {event.timestamp}
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
