import { useEffect } from 'react';
import { useReviewStore } from '@/stores/reviewStore';

export function DailySummary() {
  const { dailySummary, isLoading, error, fetchDailySummary } = useReviewStore();

  useEffect(() => {
    fetchDailySummary();
  }, [fetchDailySummary]);

  const stats = dailySummary ?? {
    tasksCompleted: 0,
    tasksTotal: 0,
    completionRate: 0,
    articlesRead: 0,
  };

  const statItems = [
    {
      label: 'TASKS',
      value: `${stats.tasksCompleted}/${stats.tasksTotal}`,
      color: 'var(--emerald)',
    },
    { label: 'RATE', value: `${stats.completionRate}%`, color: 'var(--cyan)' },
    { label: 'READ', value: `${stats.articlesRead}`, color: 'var(--violet)' },
    { label: 'STREAK', value: '-', color: 'var(--amber)' },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--emerald)' }} />
        <h4
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
        >
          Summary
        </h4>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {error ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--rose)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            {error}
          </p>
        ) : isLoading && !dailySummary ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            LOADING...
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {statItems.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center py-2 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    letterSpacing: 1,
                    color: 'var(--text-tertiary)',
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-hud)',
                    fontSize: 16,
                    fontWeight: 700,
                    color: item.color,
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
