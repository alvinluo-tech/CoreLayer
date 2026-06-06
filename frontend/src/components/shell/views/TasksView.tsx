import { useEffect } from 'react';
import {
  ListTodo,
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  Trash2,
  Tag,
  Calendar,
  Flag,
} from 'lucide-react';
import { useTaskStore, type TaskFilterStatus } from '@/stores/taskStore';
import { useShellStore } from '@/stores/shellStore';
import type { Task, TaskStatus } from '@/types/task';

// ---- Helpers ----

const statusColors: Record<TaskStatus, string> = {
  draft: 'var(--text-tertiary)',
  queued: 'var(--text-tertiary)',
  running: 'var(--cyan)',
  blocked: 'var(--amber)',
  failed: 'var(--red)',
  completed: 'var(--emerald)',
  cancelled: 'var(--text-tertiary)',
  pending: 'var(--text-tertiary)',
  in_progress: 'var(--cyan)',
  done: 'var(--emerald)',
  deleted: 'var(--text-tertiary)',
};

const statusLabels: Record<TaskStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  blocked: 'Blocked',
  failed: 'Failed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
  deleted: 'Deleted',
};

const priorityLabels: Record<number, string> = {
  1: 'P1 — Critical',
  2: 'P2 — High',
  3: 'P3 — Medium',
  4: 'P4 — Low',
  5: 'P5 — Lowest',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---- Filter Tabs ----

function FilterTabs() {
  const { filterStatus, setFilterStatus, tasks } = useTaskStore();

  const countByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status).length;

  const tabs: { value: TaskFilterStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: tasks.length },
    { value: 'pending', label: 'Pending', count: countByStatus('pending') },
    {
      value: 'in_progress',
      label: 'Active',
      count: countByStatus('in_progress') + countByStatus('running'),
    },
    { value: 'blocked', label: 'Blocked', count: countByStatus('blocked') },
    { value: 'done', label: 'Done', count: countByStatus('done') + countByStatus('completed') },
  ];

  return (
    <div
      className="flex items-center gap-1 px-3 py-2"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => setFilterStatus(tab.value)}
          className="flex items-center gap-1.5"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            border:
              filterStatus === tab.value
                ? '1px solid rgba(0,212,255,0.3)'
                : '1px solid transparent',
            background: filterStatus === tab.value ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: filterStatus === tab.value ? 'var(--cyan)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
          {tab.count > 0 && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-tertiary)',
                padding: '0 4px',
                borderRadius: 3,
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---- Task Row ----

function TaskRow({ task, isSelected }: { task: Task; isSelected: boolean }) {
  const selectTask = useTaskStore((s) => s.selectTask);
  const shellSelectTask = useShellStore((s) => s.selectTask);

  const handleClick = () => {
    selectTask(task.id);
    shellSelectTask(task.id);
  };

  const isActive = task.status === 'in_progress' || task.status === 'running';
  const isDone = task.status === 'done' || task.status === 'completed';

  return (
    <button
      className="w-full text-left px-3 py-2.5 transition-all duration-150"
      style={{
        background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--cyan)' : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {/* Status dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: statusColors[task.status],
            boxShadow: isActive ? `0 0 6px ${statusColors[task.status]}` : 'none',
            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}
        />

        {/* Title */}
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            textDecoration: isDone ? 'line-through' : 'none',
            opacity: isDone ? 0.6 : 1,
          }}
        >
          {task.title}
        </span>

        {/* Priority flag */}
        {task.priority <= 2 && (
          <Flag
            size={11}
            style={{
              color: task.priority === 1 ? 'var(--red)' : 'var(--amber)',
            }}
          />
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 ml-5">
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: statusColors[task.status],
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {statusLabels[task.status]}
        </span>

        {(task.tags?.length ?? 0) > 0 && (
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            <Tag size={9} />
            {task.tags![0]}
            {(task.tags?.length ?? 0) > 1 && ` +${task.tags!.length - 1}`}
          </span>
        )}

        {task.dueDate && (
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            <Calendar size={9} />
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
    </button>
  );
}

// ---- Task Detail ----

function TaskDetail({ task }: { task: Task }) {
  const { updateTask, deleteTask } = useTaskStore();

  const handleStatusChange = (status: TaskStatus) => {
    updateTask({ taskId: task.id, status });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColors[task.status],
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {task.title}
          </span>
        </div>

        {/* Status selector */}
        <div className="flex items-center gap-1.5">
          {(['pending', 'in_progress', 'blocked', 'done', 'cancelled'] as TaskStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 4,
                border:
                  task.status === s ? `1px solid ${statusColors[s]}40` : '1px solid transparent',
                background: task.status === s ? `${statusColors[s]}15` : 'transparent',
                color: task.status === s ? statusColors[s] : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div>
          <SectionHeader>Description</SectionHeader>
          <div
            className="mt-1 p-3"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              lineHeight: 1.5,
            }}
          >
            {task.description}
          </div>
        </div>
      )}

      {/* Objective */}
      {task.objective && (
        <div>
          <SectionHeader>Objective</SectionHeader>
          <div
            className="mt-1 p-3"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              lineHeight: 1.5,
            }}
          >
            {task.objective}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'auto 1fr', fontFamily: 'var(--font-data)', fontSize: 11 }}
      >
        <MetaLabel>Priority</MetaLabel>
        <MetaValue>{priorityLabels[task.priority] ?? `P${task.priority}`}</MetaValue>
        <MetaLabel>Status</MetaLabel>
        <MetaValue>
          <span style={{ color: statusColors[task.status] }}>{statusLabels[task.status]}</span>
        </MetaValue>
        {task.dueDate && (
          <>
            <MetaLabel>Due Date</MetaLabel>
            <MetaValue>{formatDate(task.dueDate)}</MetaValue>
          </>
        )}
        {task.assignedAgentId && (
          <>
            <MetaLabel>Agent</MetaLabel>
            <MetaValue>{task.assignedAgentId}</MetaValue>
          </>
        )}
        {task.parentTaskId && (
          <>
            <MetaLabel>Parent</MetaLabel>
            <MetaValue>{task.parentTaskId.slice(0, 12)}...</MetaValue>
          </>
        )}
        <MetaLabel>Created</MetaLabel>
        <MetaValue>{formatDate(task.createdAt)}</MetaValue>
        <MetaLabel>Updated</MetaLabel>
        <MetaValue>{formatDate(task.updatedAt)}</MetaValue>
      </div>

      {/* Tags */}
      {(task.tags?.length ?? 0) > 0 && (
        <div>
          <SectionHeader>Tags</SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {task.tags!.map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(0,212,255,0.06)',
                  border: '1px solid rgba(0,212,255,0.15)',
                  color: 'var(--cyan)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {(task.dependencies?.length ?? 0) > 0 && (
        <div>
          <SectionHeader>Dependencies ({task.dependencies!.length})</SectionHeader>
          <div className="space-y-1 mt-1">
            {task.dependencies!.map((dep) => (
              <div
                key={dep}
                className="flex items-center gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <ListTodo size={10} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{dep.slice(0, 12)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocked by */}
      {(task.blockedBy?.length ?? 0) > 0 && (
        <div>
          <SectionHeader>Blocked By ({task.blockedBy!.length})</SectionHeader>
          <div className="space-y-1 mt-1">
            {task.blockedBy!.map((dep) => (
              <div
                key={dep}
                className="flex items-center gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,184,0,0.05)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <Ban size={10} style={{ color: 'var(--amber)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{dep.slice(0, 12)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {(task.acceptanceCriteria?.length ?? 0) > 0 && (
        <div>
          <SectionHeader>Acceptance Criteria ({task.acceptanceCriteria!.length})</SectionHeader>
          <div className="space-y-1 mt-1">
            {task.acceptanceCriteria!.map((ac, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <CheckCircle2
                  size={10}
                  style={{ color: 'var(--emerald)', marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>{ac}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleStatusChange('done')}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid rgba(16,185,129,0.3)',
            background: 'rgba(16,185,129,0.08)',
            color: 'var(--emerald)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s',
          }}
        >
          <CheckCircle2 size={12} />
          Mark Done
        </button>
        <button
          onClick={() => deleteTask(task.id)}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--red)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.15s',
          }}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{children}</span>;
}

function MetaValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </span>
  );
}

// ---- Empty State ----

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <ListTodo size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO TASKS
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Create a task to track work, delegate to agents, and organize your projects.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

export function TasksView() {
  const { tasks, selectedTaskId, filterStatus, isLoading, error, fetchTasks, selectTask } =
    useTaskStore();

  const shellSelectedId = useShellStore((s) => s.selectedTaskId);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Sync from shellStore
  useEffect(() => {
    if (shellSelectedId && shellSelectedId !== selectedTaskId) {
      selectTask(shellSelectedId);
    }
  }, [shellSelectedId, selectedTaskId, selectTask]);

  // Apply filter
  const filtered = tasks.filter((t) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'in_progress') return t.status === 'in_progress' || t.status === 'running';
    if (filterStatus === 'done') return t.status === 'done' || t.status === 'completed';
    return t.status === filterStatus;
  });

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // Loading
  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error
  if (error && tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <XCircle size={32} className="mx-auto" style={{ color: 'var(--red)' }} />
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              maxWidth: 280,
            }}
          >
            {error}
          </div>
          <button
            onClick={fetchTasks}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty
  if (tasks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Filter + List */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 320,
          borderRight: '1px solid var(--glass-border)',
          background: 'rgba(4,6,14,0.4)',
          flexShrink: 0,
        }}
      >
        <FilterTabs />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                No tasks match filter
              </span>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskRow key={task.id} task={task} isSelected={task.id === selectedTaskId} />
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTask ? (
          <TaskDetail task={selectedTask} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <ListTodo size={32} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                Select a task to view details
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
