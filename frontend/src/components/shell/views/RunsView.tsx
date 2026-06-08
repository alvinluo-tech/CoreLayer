import { useEffect } from 'react';
import {
  Activity,
  MessageSquare,
  Mic,
  Zap,
  CalendarClock,
  GitBranch,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Wrench,
  Brain,
  ShieldCheck,
  FileText,
  FileCheck,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useRunStore,
  type AgentRun,
  type AgentRunEvent,
  type CodingArtifact,
  type RunStatus,
  type RunMode,
} from '@/stores/runStore';
import { useShellStore } from '@/stores/shellStore';

// ---- Helpers ----

const modeIcons: Record<RunMode, React.ReactNode> = {
  chat: <MessageSquare size={14} />,
  voice: <Mic size={14} />,
  tick: <Zap size={14} />,
  scheduled: <CalendarClock size={14} />,
  workflow: <GitBranch size={14} />,
  regenerate: <RotateCcw size={14} />,
};

const modeLabels: Record<RunMode, string> = {
  chat: 'Chat',
  voice: 'Voice',
  tick: 'Tick',
  scheduled: 'Scheduled',
  workflow: 'Workflow',
  regenerate: 'Regenerate',
};

const statusColors: Record<RunStatus, string> = {
  queued: 'var(--text-tertiary)',
  running: 'var(--cyan)',
  succeeded: 'var(--emerald)',
  failed: 'var(--red)',
  cancelled: 'var(--text-tertiary)',
  waiting_for_approval: 'var(--amber)',
};

const statusIcons: Record<RunStatus, React.ReactNode> = {
  queued: <Clock size={12} />,
  running: <Loader2 size={12} className="animate-spin" />,
  succeeded: <CheckCircle2 size={12} />,
  failed: <XCircle size={12} />,
  cancelled: <AlertTriangle size={12} />,
  waiting_for_approval: <AlertTriangle size={12} />,
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---- Event type icons ----

const eventTypeIcons: Record<string, React.ReactNode> = {
  run_started: <Play size={12} />,
  model_selected: <Zap size={12} />,
  memory_read: <Brain size={12} />,
  tool_call: <Wrench size={12} />,
  approval_required: <ShieldCheck size={12} />,
  memory_written: <Brain size={12} />,
  task_blocked: <AlertTriangle size={12} />,
  run_completed: <CheckCircle2 size={12} />,
  run_failed: <XCircle size={12} />,
};

const artifactTypeIcons: Record<string, React.ReactNode> = {
  diff_summary: <GitBranch size={12} />,
  changed_files: <GitBranch size={12} />,
  test_report: <FileCheck size={12} />,
  final_summary: <FileText size={12} />,
  log_path: <FolderOpen size={12} />,
  error: <XCircle size={12} />,
};

const artifactTypeLabels: Record<string, string> = {
  diff_summary: 'Diff Summary',
  changed_files: 'Changed Files',
  test_report: 'Test Report',
  final_summary: 'Summary',
  log_path: 'Log Path',
  error: 'Error',
};

function Play({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

// ---- Filter Bar ----

function FilterBar() {
  const { filters, setStatusFilter, setModeFilter } = useRunStore();

  const statusOptions: { value: RunStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'running', label: 'Running' },
    { value: 'succeeded', label: 'Succeeded' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const modeOptions: { value: RunMode | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'chat', label: 'Chat' },
    { value: 'voice', label: 'Voice' },
    { value: 'tick', label: 'Tick' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'workflow', label: 'Workflow' },
  ];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      <FilterGroup
        label="Status"
        options={statusOptions}
        value={filters.status}
        onChange={(v) => setStatusFilter(v as RunStatus | 'all')}
      />
      <div style={{ width: 1, height: 16, background: 'var(--glass-border)' }} />
      <FilterGroup
        label="Mode"
        options={modeOptions}
        value={filters.mode}
        onChange={(v) => setModeFilter(v as RunMode | 'all')}
      />
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: 0.5,
          marginRight: 4,
        }}
      >
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            border: value === opt.value ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
            background: value === opt.value ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: value === opt.value ? 'var(--cyan)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---- Run List Row ----

function RunRow({ run, isSelected }: { run: AgentRun; isSelected: boolean }) {
  const selectRun = useRunStore((s) => s.selectRun);
  const shellSelectRun = useShellStore((s) => s.selectRun);

  const handleClick = () => {
    selectRun(run.id);
    shellSelectRun(run.id);
  };

  const preview = run.mode === 'voice' ? 'Voice session' : `Run ${run.id.slice(0, 8)}`;

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
        {/* Mode icon */}
        <span style={{ color: 'var(--text-tertiary)' }}>{modeIcons[run.mode]}</span>

        {/* Status dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColors[run.status],
            boxShadow: run.status === 'running' ? `0 0 6px ${statusColors[run.status]}` : 'none',
            animation: run.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
          }}
        />

        {/* Preview */}
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {preview}
        </span>

        {/* Duration */}
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {formatDuration(run.durationMs)}
        </span>
      </div>

      <div className="flex items-center gap-3 ml-6">
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          {formatDate(run.startedAt)} {formatTime(run.startedAt)}
        </span>

        {run.toolCallCount != null && run.toolCallCount > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {run.toolCallCount} tools
          </span>
        )}

        {run.selectedModel && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {run.selectedModel}
          </span>
        )}
      </div>
    </button>
  );
}

// ---- Run Detail / Timeline ----

function RunDetail({
  run,
  events,
  artifacts,
}: {
  run: AgentRun;
  events: AgentRunEvent[];
  artifacts: CodingArtifact[];
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {statusIcons[run.status]}
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 13,
              fontWeight: 600,
              color: statusColors[run.status],
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {run.status}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginLeft: 'auto',
            }}
          >
            {formatDuration(run.durationMs)}
          </span>
        </div>

        {/* Metadata grid */}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'auto 1fr', fontFamily: 'var(--font-data)', fontSize: 11 }}
        >
          <MetaLabel>ID</MetaLabel>
          <MetaValue>{run.id}</MetaValue>
          <MetaLabel>Mode</MetaLabel>
          <MetaValue>
            <span className="flex items-center gap-1">
              {modeIcons[run.mode]}
              {modeLabels[run.mode]}
            </span>
          </MetaValue>
          <MetaLabel>Started</MetaLabel>
          <MetaValue>{new Date(run.startedAt).toLocaleString()}</MetaValue>
          {run.completedAt && (
            <>
              <MetaLabel>Completed</MetaLabel>
              <MetaValue>{new Date(run.completedAt).toLocaleString()}</MetaValue>
            </>
          )}
          {run.selectedModel && (
            <>
              <MetaLabel>Model</MetaLabel>
              <MetaValue>{run.selectedModel}</MetaValue>
            </>
          )}
          {run.routeReason && (
            <>
              <MetaLabel>Route</MetaLabel>
              <MetaValue>{run.routeReason}</MetaValue>
            </>
          )}
          {run.conversationId && (
            <>
              <MetaLabel>Conversation</MetaLabel>
              <MetaValue>{run.conversationId.slice(0, 12)}...</MetaValue>
            </>
          )}
          {run.taskId && (
            <>
              <MetaLabel>Task</MetaLabel>
              <MetaValue>{run.taskId.slice(0, 12)}...</MetaValue>
            </>
          )}
          {run.error && (
            <>
              <MetaLabel>Error</MetaLabel>
              <MetaValue>
                <span style={{ color: 'var(--red)' }}>{run.error}</span>
              </MetaValue>
            </>
          )}
        </div>
      </div>

      {/* Tool calls summary */}
      {run.toolCalls && run.toolCalls.length > 0 && (
        <div>
          <SectionHeader>Tool Calls ({run.toolCalls.length})</SectionHeader>
          <div className="space-y-1 mt-1">
            {(run.toolCalls as { name?: string }[]).map((tc, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <Wrench size={10} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{tc.name ?? 'unknown'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory reads/writes */}
      {run.memoryReads?.length || run.memoryWrites?.length ? (
        <div>
          <SectionHeader>Memory</SectionHeader>
          <div className="space-y-1 mt-1">
            {run.memoryReads?.map((id) => (
              <div
                key={`r-${id}`}
                className="flex items-center gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <Brain size={10} style={{ color: 'var(--cyan)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>read</span>
                <span style={{ color: 'var(--text-secondary)' }}>{id.slice(0, 12)}...</span>
              </div>
            ))}
            {run.memoryWrites?.map((id) => (
              <div
                key={`w-${id}`}
                className="flex items-center gap-2 px-2 py-1"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                }}
              >
                <Brain size={10} style={{ color: 'var(--emerald)' }} />
                <span style={{ color: 'var(--text-tertiary)' }}>write</span>
                <span style={{ color: 'var(--text-secondary)' }}>{id.slice(0, 12)}...</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div>
          <SectionHeader>Artifacts ({artifacts.length})</SectionHeader>
          <div className="space-y-1 mt-1">
            {artifacts.map((artifact, i) => {
              const icon = artifactTypeIcons[artifact.type] ?? <FileText size={12} />;
              const label = artifactTypeLabels[artifact.type] ?? artifact.type;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2 py-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      color: artifact.type === 'error' ? 'var(--red)' : 'var(--text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
                    <pre
                      className="mt-0.5 whitespace-pre-wrap break-words"
                      style={{
                        color: artifact.type === 'error' ? 'var(--red)' : 'var(--text-tertiary)',
                        fontSize: 10,
                        lineHeight: 1.4,
                        maxHeight: 120,
                        overflow: 'auto',
                      }}
                    >
                      {artifact.content}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <div>
          <SectionHeader>Timeline ({events.length})</SectionHeader>
          <div className="relative ml-2 mt-2 space-y-0">
            {/* Vertical line */}
            <div
              className="absolute left-[5px] top-2 bottom-2"
              style={{ width: 1, background: 'var(--glass-border)' }}
            />
            {events.map((evt) => (
              <TimelineEvent key={evt.id} event={evt} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineEvent({ event }: { event: AgentRunEvent }) {
  const icon = eventTypeIcons[event.type] ?? <Activity size={12} />;
  const payload = event.payload as Record<string, unknown> | null;

  let detail = '';
  if (event.type === 'tool_call' && payload?.toolCall) {
    const tc = payload.toolCall as { name?: string };
    detail = tc.name ?? '';
  } else if (event.type === 'model_selected' && payload?.modelId) {
    detail = String(payload.modelId);
  } else if (event.type === 'memory_read' && payload?.memoryIds) {
    detail = `${(payload.memoryIds as string[]).length} memories`;
  } else if (event.type === 'memory_written' && payload?.memoryIds) {
    detail = `${(payload.memoryIds as string[]).length} memories`;
  } else if (event.type === 'run_failed' && payload?.error) {
    detail = String(payload.error);
  } else if (event.type === 'task_blocked' && payload?.taskId) {
    detail = `task ${String(payload.taskId).slice(0, 8)}`;
  }

  return (
    <div className="relative flex items-start gap-3 py-1.5 pl-4">
      {/* Dot on timeline */}
      <div
        className="absolute left-0 top-2.5"
        style={{
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: 'var(--bg-void)',
          border: '2px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'var(--text-tertiary)', transform: 'scale(0.6)' }}>{icon}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}
          >
            {event.type.replace(/_/g, ' ')}
          </span>
          {detail && (
            <span
              className="truncate"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              {detail}
            </span>
          )}
          <span
            className="ml-auto shrink-0"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
            }}
          >
            {formatTime(event.createdAt)}
          </span>
        </div>
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
        <Activity size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO RUNS
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Start a chat, voice session, or scheduled task to generate an auditable run.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

export function RunsView() {
  const {
    runs,
    selectedRunId,
    events,
    artifacts,
    filters,
    isLoading,
    isLoadingEvents,
    isLoadingArtifacts,
    error,
    fetchRuns,
    selectRun,
  } = useRunStore();

  const shellSelectedRunId = useShellStore((s) => s.selectedRunId);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Sync from shellStore if navigated externally
  useEffect(() => {
    if (shellSelectedRunId && shellSelectedRunId !== selectedRunId) {
      selectRun(shellSelectedRunId);
    }
  }, [shellSelectedRunId, selectedRunId, selectRun]);

  // Apply filters
  const filtered = runs.filter((run) => {
    if (filters.status !== 'all' && run.status !== filters.status) return false;
    if (filters.mode !== 'all' && run.mode !== filters.mode) return false;
    return true;
  });

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  // Loading state
  if (isLoading && runs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error state
  if (error && runs.length === 0) {
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
          <Button variant="glass" size="sm" onClick={fetchRuns} className="gap-1.5">
            <RotateCcw size={12} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (runs.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Filter bar + Run list */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 320,
          borderRight: '1px solid var(--glass-border)',
          background: 'rgba(4,6,14,0.4)',
          flexShrink: 0,
        }}
      >
        <FilterBar />
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
                No runs match filters
              </span>
            </div>
          ) : (
            filtered.map((run) => (
              <RunRow key={run.id} run={run} isSelected={run.id === selectedRunId} />
            ))
          )}
        </div>
      </div>

      {/* Right: Detail / Timeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedRun ? (
          <RunDetail run={selectedRun} events={events} artifacts={artifacts} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Activity size={32} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                Select a run to view details
              </div>
            </div>
          </div>
        )}

        {/* Loading events indicator */}
        {(isLoadingEvents || isLoadingArtifacts) && (
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{ borderTop: '1px solid var(--glass-border)' }}
          >
            <Loader2 size={12} className="animate-spin" style={{ color: 'var(--cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Loading run details...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
