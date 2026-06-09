import { useState } from 'react';
import { Bot, Wrench, Brain, ShieldCheck, Settings } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  agentName?: string;
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
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {event.message}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
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
