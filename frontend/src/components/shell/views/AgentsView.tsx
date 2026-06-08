import { useEffect, useState } from 'react';
import {
  Bot,
  Loader2,
  XCircle,
  Shield,
  Wrench,
  Brain,
  Star,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentStore, type AgentProfile } from '@/stores/agentStore';

// ---- Tag Input ----

function TagInput({
  value,
  onChange,
  placeholder,
  color,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  color: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color,
              background: `${color}15`,
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${color}25`,
            }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{ color, fontSize: 10, lineHeight: 1, cursor: 'pointer' }}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={placeholder}
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: 4,
          padding: '4px 8px',
          width: '100%',
          outline: 'none',
        }}
      />
    </div>
  );
}

// ---- Edit Form ----

function AgentEditForm({
  agent,
  onSave,
  onCancel,
}: {
  agent: AgentProfile | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [skills, setSkills] = useState<string[]>(agent?.skills ?? []);
  const [tools, setTools] = useState<string[]>(agent?.tools ?? []);
  const [permissions, setPermissions] = useState<string[]>(agent?.permissions ?? []);
  const [knowledgeScopes, setKnowledgeScopes] = useState<string[]>(agent?.knowledgeScopes ?? []);
  const [memoryScopes, setMemoryScopes] = useState<string[]>(agent?.memoryScopes ?? []);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name,
        description,
        skills,
        tools,
        permissions,
        knowledgeScopes,
        memoryScopes,
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto flex-1">
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: 0.5,
          }}
        >
          {agent ? 'Edit Agent' : 'New Agent'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--glass-border)',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <Label>Name</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          placeholder="Agent name"
        />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' as const }}
          placeholder="What does this agent do?"
        />
      </div>

      {/* Skills */}
      <div>
        <Label>
          <span className="flex items-center gap-1">
            <Brain size={10} />
            Skills
          </span>
        </Label>
        <TagInput
          value={skills}
          onChange={setSkills}
          placeholder="Add skill..."
          color="var(--cyan)"
        />
      </div>

      {/* Tools */}
      <div>
        <Label>
          <span className="flex items-center gap-1">
            <Wrench size={10} />
            Tools
          </span>
        </Label>
        <TagInput
          value={tools}
          onChange={setTools}
          placeholder="Add tool..."
          color="var(--emerald)"
        />
      </div>

      {/* Permissions */}
      <div>
        <Label>
          <span className="flex items-center gap-1">
            <Shield size={10} />
            Permissions
          </span>
        </Label>
        <TagInput
          value={permissions}
          onChange={setPermissions}
          placeholder="Add permission..."
          color="var(--amber)"
        />
      </div>

      {/* Knowledge Scopes */}
      <div>
        <Label>Knowledge Scopes</Label>
        <TagInput
          value={knowledgeScopes}
          onChange={setKnowledgeScopes}
          placeholder="Add scope..."
          color="var(--text-secondary)"
        />
      </div>

      {/* Memory Scopes */}
      <div>
        <Label>Memory Scopes</Label>
        <TagInput
          value={memoryScopes}
          onChange={setMemoryScopes}
          placeholder="Add scope..."
          color="var(--text-secondary)"
        />
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 11,
  color: 'var(--text-secondary)',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--glass-border)',
  borderRadius: 4,
  padding: '6px 10px',
  width: '100%',
  outline: 'none',
};

// ---- Agent Row ----

function AgentRow({
  agent,
  isSelected,
  onDelete,
  onSetDefault,
}: {
  agent: AgentProfile;
  isSelected: boolean;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <button
      className="w-full text-left px-3 py-2.5 transition-all duration-150"
      style={{
        background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--cyan)' : '2px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
      onClick={() => selectAgent(agent.id)}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Bot size={14} style={{ color: 'var(--text-tertiary)' }} />
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {agent.name}
        </span>
        {agent.isDefault && (
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--amber)',
              background: 'rgba(255,184,0,0.1)',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            <Star size={8} />
            Default
          </span>
        )}
      </div>
      {agent.description && (
        <div
          className="truncate ml-6"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          {agent.description}
        </div>
      )}
      {isSelected && (
        <div className="flex gap-1.5 mt-2 ml-6">
          {!agent.isDefault && (
            <ActionBtn onClick={() => onSetDefault(agent.id)} title="Set as default">
              <Star size={10} />
            </ActionBtn>
          )}
          {!agent.isDefault && (
            <ActionBtn onClick={() => onDelete(agent.id)} title="Delete" hoverColor="var(--red)">
              <Trash2 size={10} />
            </ActionBtn>
          )}
        </div>
      )}
    </button>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  hoverColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  hoverColor?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 4,
        border: '1px solid var(--glass-border)',
        background: 'rgba(255,255,255,0.03)',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = hoverColor ?? 'var(--cyan)';
        e.currentTarget.style.borderColor = hoverColor ?? 'rgba(0,212,255,0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-tertiary)';
        e.currentTarget.style.borderColor = 'var(--glass-border)';
      }}
    >
      {children}
    </button>
  );
}

// ---- Agent Detail ----

function AgentDetail({ agent }: { agent: AgentProfile }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot size={16} style={{ color: 'var(--cyan)' }} />
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {agent.name}
        </span>
        {agent.isDefault && (
          <span
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--amber)',
              background: 'rgba(255,184,0,0.1)',
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            <Star size={8} />
            Default
          </span>
        )}
      </div>

      {/* Description */}
      {agent.description && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {agent.description}
        </div>
      )}

      {/* Metadata */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'auto 1fr',
          fontFamily: 'var(--font-data)',
          fontSize: 11,
        }}
      >
        <MetaLabel>Created</MetaLabel>
        <MetaValue>{formatDate(agent.createdAt)}</MetaValue>
        <MetaLabel>Updated</MetaLabel>
        <MetaValue>{formatDate(agent.updatedAt)}</MetaValue>
        <MetaLabel>ID</MetaLabel>
        <MetaValue>{agent.id.slice(0, 12)}...</MetaValue>
      </div>

      {/* Skills */}
      {agent.skills.length > 0 && (
        <div>
          <SectionHeader>
            <span className="flex items-center gap-1">
              <Brain size={10} />
              Skills
            </span>
          </SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {agent.skills.map((skill) => (
              <Tag key={skill} color="var(--cyan)">
                {skill}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Tools */}
      {agent.tools.length > 0 && (
        <div>
          <SectionHeader>
            <span className="flex items-center gap-1">
              <Wrench size={10} />
              Tools
            </span>
          </SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {agent.tools.map((tool) => (
              <Tag key={tool} color="var(--emerald)">
                {tool}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Permissions */}
      {agent.permissions.length > 0 && (
        <div>
          <SectionHeader>
            <span className="flex items-center gap-1">
              <Shield size={10} />
              Permissions
            </span>
          </SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {agent.permissions.map((perm) => (
              <Tag key={perm} color="var(--amber)">
                {perm}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Memory Scopes */}
      {agent.memoryScopes.length > 0 && (
        <div>
          <SectionHeader>Memory Scopes</SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {agent.memoryScopes.map((scope) => (
              <Tag key={scope} color="var(--text-secondary)">
                {scope}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Scopes */}
      {agent.knowledgeScopes.length > 0 && (
        <div>
          <SectionHeader>Knowledge Scopes</SectionHeader>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {agent.knowledgeScopes.map((scope) => (
              <Tag key={scope} color="var(--text-secondary)">
                {scope}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Model Policy */}
      {typeof agent.modelPolicy === 'object' && agent.modelPolicy !== null && (
        <div>
          <SectionHeader>Model Policy</SectionHeader>
          <div
            className="mt-1.5 p-3"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              lineHeight: 1.5,
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(agent.modelPolicy, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Executor Policy */}
      {typeof agent.executorPolicy === 'object' && agent.executorPolicy !== null && (
        <div>
          <SectionHeader>Executor Policy</SectionHeader>
          <div
            className="mt-1.5 p-3"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              lineHeight: 1.5,
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(agent.executorPolicy, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        color,
        background: `${color}15`,
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${color}25`,
      }}
    >
      {children}
    </span>
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Empty State ----

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Bot size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO AGENTS
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Agent profiles will appear here. Each agent has its own model, tools, skills, and
          permissions.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

type ViewMode = 'list' | 'edit' | 'create';

export function AgentsView() {
  const {
    agents,
    selectedId,
    isLoading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    setDefaultAgent,
  } = useAgentStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const handleCreate = async (data: Record<string, unknown>) => {
    await createAgent(data as any);
    setViewMode('list');
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (selectedId) {
      await updateAgent(selectedId, data as any);
      setViewMode('list');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAgent(id);
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultAgent(id);
  };

  // Loading
  if (isLoading && agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error
  if (error && agents.length === 0) {
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
          <Button variant="glass" size="sm" onClick={fetchAgents} className="gap-1.5">
            <RotateCcw size={12} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty
  if (agents.length === 0 && viewMode !== 'create') {
    return <EmptyState />;
  }

  const showForm = viewMode === 'create' || (viewMode === 'edit' && selectedAgent);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Agent list */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 300,
          borderRight: '1px solid var(--glass-border)',
          background: 'rgba(4,6,14,0.4)',
          flexShrink: 0,
        }}
      >
        <div
          className="px-3 py-2 flex items-center justify-between"
          style={{
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Agent Profiles ({agents.length})
          </span>
          <button
            onClick={() => setViewMode('create')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            <Plus size={10} />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedId}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      </div>

      {/* Right: Detail or Edit */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showForm ? (
          <AgentEditForm
            agent={viewMode === 'edit' ? selectedAgent : null}
            onSave={viewMode === 'edit' ? handleUpdate : handleCreate}
            onCancel={() => setViewMode('list')}
          />
        ) : selectedAgent ? (
          <>
            {/* Edit button */}
            <div
              className="px-4 py-2 flex justify-end"
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <button
                onClick={() => setViewMode('edit')}
                className="flex items-center gap-1"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                <Pencil size={10} />
                Edit
              </button>
            </div>
            <AgentDetail agent={selectedAgent} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Bot size={32} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
              <div
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                Select an agent to view details
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
