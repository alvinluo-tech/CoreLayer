import { useEffect } from 'react';
import { Bot, Loader2, XCircle, Shield, Wrench, Brain, Star } from 'lucide-react';
import { useAgentStore, type AgentProfile } from '@/stores/agentStore';

// ---- Agent Row ----

function AgentRow({ agent, isSelected }: { agent: AgentProfile; isSelected: boolean }) {
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
              <span
                key={skill}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--cyan)',
                  background: 'rgba(0,212,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(0,212,255,0.15)',
                }}
              >
                {skill}
              </span>
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
              <span
                key={tool}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--emerald)',
                  background: 'rgba(16,185,129,0.08)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(16,185,129,0.15)',
                }}
              >
                {tool}
              </span>
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
              <span
                key={perm}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--amber)',
                  background: 'rgba(255,184,0,0.08)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,184,0,0.15)',
                }}
              >
                {perm}
              </span>
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
              <span
                key={scope}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--glass-border)',
                }}
              >
                {scope}
              </span>
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
              <span
                key={scope}
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--glass-border)',
                }}
              >
                {scope}
              </span>
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

export function AgentsView() {
  const { agents, selectedId, isLoading, error, fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

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
          <button
            onClick={fetchAgents}
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
  if (agents.length === 0) {
    return <EmptyState />;
  }

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
          className="px-3 py-2"
          style={{
            borderBottom: '1px solid var(--glass-border)',
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Agent Profiles ({agents.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} isSelected={agent.id === selectedId} />
          ))}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAgent ? (
          <AgentDetail agent={selectedAgent} />
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
