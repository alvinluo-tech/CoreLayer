import type React from 'react';
import { useEffect } from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';

type TaskStatus = 'done' | 'in_progress' | 'pending';
type TaskPriority = 1 | 2 | 3 | 4 | 5;

const statusConfig: Record<TaskStatus, { icon: React.ReactNode; color: string }> = {
  done: { icon: <CheckCircle2 className="h-3 w-3" />, color: 'var(--emerald)' },
  in_progress: { icon: <Clock className="h-3 w-3" />, color: 'var(--amber)' },
  pending: { icon: <Circle className="h-3 w-3" />, color: 'var(--text-tertiary)' },
};

function getStatus(key: string): { icon: React.ReactNode; color: string } {
  return statusConfig[key as TaskStatus] ?? statusConfig.pending;
}

function getPriority(key: number): { label: string; color: string } {
  return priorityConfig[key as TaskPriority] ?? priorityConfig[3];
}

const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  1: { label: 'P1', color: 'var(--rose)' },
  2: { label: 'P2', color: 'var(--amber)' },
  3: { label: 'P3', color: 'var(--text-tertiary)' },
  4: { label: 'P4', color: 'var(--text-tertiary)' },
  5: { label: 'P5', color: 'var(--text-tertiary)' },
};

export function TodayView() {
  const { tasks, isLoading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== 'deleted' && (t.dueDate === today || (t.priority <= 2 && t.status !== 'done'))
  );
  const completed = todayTasks.filter((t) => t.status === 'done').length;

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
        className="px-3 py-2.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cyan)' }} />
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
            Today
          </h4>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {completed}/{todayTasks.length}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {error && !isLoading ? (
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
        ) : isLoading && tasks.length === 0 ? (
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
        ) : todayTasks.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            NO TASKS TODAY
          </p>
        ) : (
          <div className="space-y-1">
            {todayTasks.slice(0, 6).map((task) => {
              const s = getStatus(task.status);
              const p = getPriority(task.priority);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                  style={{ cursor: 'default' }}
                >
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span
                    className="flex-1 truncate"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color:
                        task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: p.color,
                      opacity: 0.7,
                    }}
                  >
                    {p.label}
                  </span>
                </div>
              );
            })}
            {todayTasks.length > 6 && (
              <p
                className="text-center pt-1"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                }}
              >
                +{todayTasks.length - 6} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
