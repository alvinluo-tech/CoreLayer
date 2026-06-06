import { useEffect } from 'react';
import {
  Brain,
  XCircle,
  Loader2,
  Trash2,
  AlertTriangle,
  User,
  FolderKanban,
  Bot,
  ListTodo,
  MessageSquare,
  Globe,
} from 'lucide-react';
import {
  useMemoryStore,
  type Memory,
  type MemoryScopeType,
  type MemoryType,
  type MemoryFilterScope,
  type MemoryFilterType,
} from '@/stores/memoryStore';
import { useShellStore } from '@/stores/shellStore';

// ---- Helpers ----

const scopeIcons: Record<MemoryScopeType, React.ReactNode> = {
  user: <User size={12} />,
  workspace: <Globe size={12} />,
  project: <FolderKanban size={12} />,
  agent: <Bot size={12} />,
  task: <ListTodo size={12} />,
  conversation: <MessageSquare size={12} />,
};

const scopeLabels: Record<MemoryScopeType, string> = {
  user: 'User',
  workspace: 'Workspace',
  project: 'Project',
  agent: 'Agent',
  task: 'Task',
  conversation: 'Conversation',
};

const typeLabels: Record<MemoryType, string> = {
  fact: 'Fact',
  preference: 'Preference',
  context: 'Context',
  summary: 'Summary',
};

const typeColors: Record<MemoryType, string> = {
  fact: 'var(--cyan)',
  preference: 'var(--amber)',
  context: 'var(--text-tertiary)',
  summary: 'var(--emerald)',
};

const tierColors: Record<string, string> = {
  fact: 'var(--cyan)',
  context: 'var(--text-tertiary)',
  preference: 'var(--amber)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatConfidence(c: number | null): string {
  if (c == null) return '—';
  return `${Math.round(c * 100)}%`;
}

// ---- Filter Bar ----

function FilterBar() {
  const { filters, setScopeFilter, setTypeFilter } = useMemoryStore();

  const scopeOptions: { value: MemoryFilterScope; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'user', label: 'User' },
    { value: 'project', label: 'Project' },
    { value: 'agent', label: 'Agent' },
    { value: 'task', label: 'Task' },
    { value: 'conversation', label: 'Conv' },
  ];

  const typeOptions: { value: MemoryFilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'fact', label: 'Fact' },
    { value: 'preference', label: 'Pref' },
    { value: 'context', label: 'Ctx' },
    { value: 'summary', label: 'Summary' },
  ];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      <FilterGroup
        label="Scope"
        options={scopeOptions}
        value={filters.scope}
        onChange={(v) => setScopeFilter(v as MemoryFilterScope)}
      />
      <div style={{ width: 1, height: 16, background: 'var(--glass-border)' }} />
      <FilterGroup
        label="Type"
        options={typeOptions}
        value={filters.type}
        onChange={(v) => setTypeFilter(v as MemoryFilterType)}
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

// ---- Memory Row ----

function MemoryRow({ memory, isSelected }: { memory: Memory; isSelected: boolean }) {
  const selectMemory = useMemoryStore((s) => s.selectMemory);
  const shellSelectMemory = useShellStore((s) => s.selectMemory);

  const handleClick = () => {
    selectMemory(memory.id);
    shellSelectMemory(memory.id);
  };

  const isStale =
    memory.lastVerifiedAt &&
    Date.now() - new Date(memory.lastVerifiedAt).getTime() > 30 * 24 * 60 * 60 * 1000;

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
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Scope icon */}
        <span style={{ color: 'var(--text-tertiary)' }}>{scopeIcons[memory.scopeType]}</span>

        {/* Key */}
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {memory.key}
        </span>

        {/* Type badge */}
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: typeColors[memory.type],
            background: `${typeColors[memory.type]}15`,
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {typeLabels[memory.type]}
        </span>

        {/* Stale warning */}
        {isStale && <AlertTriangle size={11} style={{ color: 'var(--amber)' }} />}
      </div>

      {/* Value preview */}
      <div
        className="truncate ml-6"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        {memory.value}
      </div>
    </button>
  );
}

// ---- Memory Detail ----

function MemoryDetail({ memory }: { memory: Memory }) {
  const { deleteMemory } = useMemoryStore();

  const isStale =
    memory.lastVerifiedAt &&
    Date.now() - new Date(memory.lastVerifiedAt).getTime() > 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {scopeIcons[memory.scopeType]}
          <span
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {memory.key}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: typeColors[memory.type],
              background: `${typeColors[memory.type]}15`,
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            {typeLabels[memory.type]}
          </span>
        </div>

        {/* Stale warning */}
        {isStale && (
          <div
            className="flex items-center gap-2 px-2 py-1.5"
            style={{
              background: 'rgba(255,184,0,0.08)',
              borderRadius: 6,
              border: '1px solid rgba(255,184,0,0.2)',
            }}
          >
            <AlertTriangle size={12} style={{ color: 'var(--amber)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--amber)',
              }}
            >
              This memory hasn't been verified in over 30 days
            </span>
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <SectionHeader>Value</SectionHeader>
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
          {memory.value}
        </div>
      </div>

      {/* Metadata */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'auto 1fr', fontFamily: 'var(--font-data)', fontSize: 11 }}
      >
        <MetaLabel>Scope</MetaLabel>
        <MetaValue>
          <span className="flex items-center gap-1">
            {scopeIcons[memory.scopeType]}
            {scopeLabels[memory.scopeType]}
            {memory.scopeId && ` (${memory.scopeId.slice(0, 8)}...)`}
          </span>
        </MetaValue>
        <MetaLabel>Tier</MetaLabel>
        <MetaValue>
          <span style={{ color: tierColors[memory.tier] }}>{memory.tier}</span>
        </MetaValue>
        <MetaLabel>Confidence</MetaLabel>
        <MetaValue>{formatConfidence(memory.confidence)}</MetaValue>
        <MetaLabel>Uses</MetaLabel>
        <MetaValue>{memory.uses}</MetaValue>
        <MetaLabel>Source</MetaLabel>
        <MetaValue>{memory.source ?? '—'}</MetaValue>
        <MetaLabel>Created</MetaLabel>
        <MetaValue>{formatDate(memory.createdAt)}</MetaValue>
        <MetaLabel>Updated</MetaLabel>
        <MetaValue>{formatDate(memory.updatedAt)}</MetaValue>
        {memory.lastInjectedAt && (
          <>
            <MetaLabel>Last Injected</MetaLabel>
            <MetaValue>{formatDate(memory.lastInjectedAt)}</MetaValue>
          </>
        )}
        {memory.lastVerifiedAt && (
          <>
            <MetaLabel>Last Verified</MetaLabel>
            <MetaValue>{formatDate(memory.lastVerifiedAt)}</MetaValue>
          </>
        )}
        {memory.sourceRunId && (
          <>
            <MetaLabel>Source Run</MetaLabel>
            <MetaValue>{memory.sourceRunId.slice(0, 12)}...</MetaValue>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => deleteMemory(memory.id)}
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
        <Brain size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO MEMORIES
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Memories will appear here as Jarvis learns from your conversations.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

export function MemoryView() {
  const { memories, selectedId, filters, isLoading, error, fetchMemories, selectMemory } =
    useMemoryStore();

  const shellSelectedId = useShellStore((s) => s.selectedMemoryId);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Sync from shellStore
  useEffect(() => {
    if (shellSelectedId && shellSelectedId !== selectedId) {
      selectMemory(shellSelectedId);
    }
  }, [shellSelectedId, selectedId, selectMemory]);

  // Apply filters
  const filtered = memories.filter((m) => {
    if (filters.scope !== 'all' && m.scopeType !== filters.scope) return false;
    if (filters.type !== 'all' && m.type !== filters.type) return false;
    return true;
  });

  // Group by scopeType
  const grouped = new Map<MemoryScopeType, Memory[]>();
  for (const m of filtered) {
    const group = grouped.get(m.scopeType) ?? [];
    group.push(m);
    grouped.set(m.scopeType, group);
  }

  const selectedMemory = memories.find((m) => m.id === selectedId) ?? null;

  // Loading
  if (isLoading && memories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error
  if (error && memories.length === 0) {
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
            onClick={fetchMemories}
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
  if (memories.length === 0) {
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
                No memories match filters
              </span>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([scope, items]) => (
              <div key={scope}>
                {/* Group header */}
                <div
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  {scopeIcons[scope]}
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-tertiary)',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    {scopeLabels[scope]}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      marginLeft: 'auto',
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                {items.map((m) => (
                  <MemoryRow key={m.id} memory={m} isSelected={m.id === selectedId} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMemory ? (
          <MemoryDetail memory={selectedMemory} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Brain size={32} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                Select a memory to view details
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
