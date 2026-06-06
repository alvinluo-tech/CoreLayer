interface TimelineEvent {
  id: string;
  type: string;
  label: string;
  detail?: string;
  timestamp?: string;
  color?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const defaultColor = 'var(--text-tertiary)';

export function Timeline({ events }: TimelineProps) {
  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={event.id} className="flex gap-3">
          {/* Dot + Line */}
          <div className="flex flex-col items-center" style={{ width: 12 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: event.color ?? defaultColor,
                flexShrink: 0,
                marginTop: 5,
              }}
            />
            {i < events.length - 1 && (
              <span
                style={{
                  width: 1,
                  flex: 1,
                  background: 'var(--glass-border)',
                  marginTop: 2,
                }}
              />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-3">
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: event.color ?? 'var(--text-secondary)',
                }}
              >
                {event.label}
              </span>
              {event.timestamp && (
                <span
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {event.timestamp}
                </span>
              )}
            </div>
            {event.detail && (
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  marginTop: 2,
                }}
              >
                {event.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
