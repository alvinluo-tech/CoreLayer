import { useState } from 'react';
import {
  Bot,
  Brain,
  Wrench,
  ShieldCheck,
  Lock,
  FolderKanban,
  ChevronDown,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { MetaLabel, MetaValue, MetaGrid, Tag } from '@/components/ui/agent-os';
import type { AgentProfile } from '@/stores/agentStore';

interface AgentDetailPanelProps {
  agent: AgentProfile;
  onEdit: () => void;
  onTest: () => void;
  onUpdate: (data: Record<string, unknown>) => Promise<void>;
}

const roleColors: Record<string, string> = {
  planner: 'var(--violet)',
  coding: 'var(--cyan)',
  review: 'var(--emerald)',
  testing: 'var(--amber)',
  research: '#f472b6',
  general: 'var(--text-tertiary)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="glass-card overflow-hidden" style={{ borderRadius: 8 }}>
      <div
        className={`section-header flex items-center justify-between px-3 py-2 ${!isOpen ? 'collapsed' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderBottom: isOpen ? '1px solid var(--glass-border)' : 'none' }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 3,
              height: 14,
              borderRadius: 2,
              background: 'linear-gradient(180deg, var(--cyan), transparent)',
            }}
          />
          <Icon size={12} style={{ color: 'var(--text-tertiary)' }} />
          <span className="hud-label" style={{ fontSize: 10 }}>
            {title}
          </span>
        </div>
        <ChevronDown
          size={14}
          className="collapse-arrow"
          style={{ color: 'var(--text-tertiary)' }}
        />
      </div>
      <div className={`section-body ${!isOpen ? 'collapsed' : ''}`}>
        <div className="px-3 py-3 space-y-2.5">{children}</div>
      </div>
    </div>
  );
}

function InlineEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 12,
            color: 'var(--text-primary)',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 4,
            padding: '2px 6px',
            outline: 'none',
            flex: 1,
          }}
        />
        <button onClick={save} style={{ color: 'var(--emerald)', cursor: 'pointer' }}>
          <Check size={12} />
        </button>
        <button onClick={cancel} style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }}>
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="inline-edit flex items-center gap-1 group" onClick={() => setEditing(true)}>
      <span
        style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--text-secondary)' }}
      >
        {value || <em style={{ color: 'var(--text-tertiary)' }}>empty</em>}
      </span>
      <Pencil
        size={10}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
      />
    </div>
  );
}

function ExecutorCard({
  label,
  description,
  isSelected,
  onClick,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`executor-card p-2.5 text-left ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {label}
        </span>
        {isSelected && <Check size={12} style={{ color: 'var(--cyan)', marginLeft: 'auto' }} />}
      </div>
      <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--text-tertiary)' }}>
        {description}
      </div>
    </button>
  );
}

export function AgentDetailPanel({ agent, onEdit, onTest, onUpdate }: AgentDetailPanelProps) {
  const executorPolicy = agent.executorPolicy as {
    executor?: string;
    maxConcurrent?: number;
    workDir?: string;
  } | null;
  const currentExecutor = executorPolicy?.executor ?? 'self';
  const modelPolicy = agent.modelPolicy as Record<string, unknown> | null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky Top Bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'rgba(10,14,26,0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(0,212,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bot size={16} style={{ color: 'var(--cyan)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: 'var(--font-hud)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {agent.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  color: roleColors[agent.role || 'general'] ?? 'var(--text-tertiary)',
                  background: `${roleColors[agent.role || 'general'] ?? 'var(--text-tertiary)'}15`,
                  padding: '1px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                }}
              >
                {agent.role || 'general'}
              </span>
              {agent.isDefault && (
                <span
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 9,
                    color: 'var(--amber)',
                    background: 'rgba(255,184,0,0.1)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  ★ Default
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            <Pencil size={10} />
            Edit
          </button>
          <button
            onClick={onTest}
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--emerald)',
              background: 'rgba(0,230,138,0.08)',
              border: '1px solid rgba(0,230,138,0.15)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            <Check size={10} />
            Test
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 agents-scroll">
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

        {/* Basic Info */}
        <CollapsibleSection title="Basic Info" icon={Bot}>
          <MetaGrid>
            <MetaLabel>Name</MetaLabel>
            <MetaValue>
              <InlineEdit value={agent.name} onSave={(v) => onUpdate({ name: v })} />
            </MetaValue>
            <MetaLabel>Description</MetaLabel>
            <MetaValue>
              <InlineEdit
                value={agent.description ?? ''}
                onSave={(v) => onUpdate({ description: v || null })}
              />
            </MetaValue>
            <MetaLabel>Created</MetaLabel>
            <MetaValue>{formatDate(agent.createdAt)}</MetaValue>
            <MetaLabel>Updated</MetaLabel>
            <MetaValue>{formatDate(agent.updatedAt)}</MetaValue>
          </MetaGrid>
        </CollapsibleSection>

        {/* Capabilities */}
        <CollapsibleSection title="Capabilities" icon={Brain}>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Brain
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  Skills
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.skills.length > 0 ? (
                    agent.skills.map((s) => (
                      <Tag key={s} color="var(--cyan)">
                        {s}
                      </Tag>
                    ))
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                      }}
                    >
                      none
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Wrench
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  Tools
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.tools.length > 0 ? (
                    agent.tools.map((t) => (
                      <Tag key={t} color="var(--emerald)">
                        {t}
                      </Tag>
                    ))
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                      }}
                    >
                      none
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  MCP Servers
                </div>
                <div className="flex flex-wrap gap-1">
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      fontStyle: 'italic',
                    }}
                  >
                    none
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Lock
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  Permissions
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.permissions.length > 0 ? (
                    agent.permissions.map((p) => (
                      <Tag key={p} color="var(--amber)">
                        {p}
                      </Tag>
                    ))
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                      }}
                    >
                      none
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Code Executor */}
        <CollapsibleSection title="Code Executor" icon={Wrench}>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <ExecutorCard
              label="Self"
              description="Built-in — runs within daemon"
              isSelected={currentExecutor === 'self'}
              onClick={() => onUpdate({ executorPolicy: { ...executorPolicy, executor: 'self' } })}
            />
            <ExecutorCard
              label="Claude Code"
              description="Anthropic's CLI agent"
              isSelected={currentExecutor === 'claude-code'}
              onClick={() =>
                onUpdate({ executorPolicy: { ...executorPolicy, executor: 'claude-code' } })
              }
            />
            <ExecutorCard
              label="Codex"
              description="OpenAI autonomous coder"
              isSelected={currentExecutor === 'codex'}
              onClick={() => onUpdate({ executorPolicy: { ...executorPolicy, executor: 'codex' } })}
            />
            <ExecutorCard
              label="OpenCode"
              description="Open-source pipeline"
              isSelected={currentExecutor === 'opencode'}
              onClick={() =>
                onUpdate({ executorPolicy: { ...executorPolicy, executor: 'opencode' } })
              }
            />
          </div>
          {currentExecutor !== 'self' && (
            <MetaGrid>
              <MetaLabel>Max Concurrent</MetaLabel>
              <MetaValue>{executorPolicy?.maxConcurrent ?? 3}</MetaValue>
              <MetaLabel>Work Directory</MetaLabel>
              <MetaValue>{executorPolicy?.workDir ?? '/projects'}</MetaValue>
            </MetaGrid>
          )}
        </CollapsibleSection>

        {/* Scopes */}
        <CollapsibleSection title="Scopes" icon={FolderKanban}>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <FolderKanban
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  Knowledge
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.knowledgeScopes.length > 0 ? (
                    agent.knowledgeScopes.map((s) => (
                      <Tag key={s} color="rgba(255,255,255,0.4)">
                        {s}
                      </Tag>
                    ))
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                      }}
                    >
                      none
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Brain
                size={10}
                style={{ color: 'var(--text-tertiary)', marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  Memory
                </div>
                <div className="flex flex-wrap gap-1">
                  {agent.memoryScopes.length > 0 ? (
                    agent.memoryScopes.map((s) => (
                      <Tag key={s} color="rgba(255,255,255,0.4)">
                        {s}
                      </Tag>
                    ))
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                      }}
                    >
                      none
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Model Policy */}
        <CollapsibleSection title="Model Policy" icon={Bot}>
          {modelPolicy && Object.keys(modelPolicy).length > 0 ? (
            <div
              className="p-3"
              style={{
                fontFamily: 'var(--font-code)',
                fontSize: 11,
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.04)',
                lineHeight: 1.5,
              }}
            >
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {JSON.stringify(modelPolicy, null, 2)}
              </pre>
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              No model policy configured
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
