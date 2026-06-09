import { useState, useEffect } from 'react';
import { X, Bot, Brain, Wrench, FolderKanban, Lock } from 'lucide-react';
import { TagInput } from '@/components/ui/agent-os';
import type { AgentProfile } from '@/stores/agentStore';

type ExecutorType = 'self' | 'claude-code' | 'codex' | 'opencode';

interface AgentEditPanelProps {
  agent: AgentProfile | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

interface FormData {
  name: string;
  description: string;
  skills: string[];
  tools: string[];
  permissions: string[];
  knowledgeScopes: string[];
  memoryScopes: string[];
  executor: ExecutorType;
  preferredModels: string[];
  temperature: string;
  maxTokens: string;
}

function toFormData(agent: AgentProfile | null): FormData {
  if (!agent) {
    return {
      name: '',
      description: '',
      skills: [],
      tools: [],
      permissions: [],
      knowledgeScopes: [],
      memoryScopes: [],
      executor: 'self',
      preferredModels: [],
      temperature: '',
      maxTokens: '',
    };
  }

  const ep = agent.executorPolicy as { executor?: ExecutorType } | null;
  const mp = agent.modelPolicy as Record<string, unknown> | null;

  return {
    name: agent.name,
    description: agent.description ?? '',
    skills: [...agent.skills],
    tools: [...agent.tools],
    permissions: [...agent.permissions],
    knowledgeScopes: [...agent.knowledgeScopes],
    memoryScopes: [...agent.memoryScopes],
    executor: ep?.executor ?? 'self',
    preferredModels: (mp?.preferredModels as string[] | undefined) ?? [],
    temperature: mp?.temperature !== undefined ? String(mp.temperature) : '',
    maxTokens: mp?.maxTokens !== undefined ? String(mp.maxTokens) : '',
  };
}

export function AgentEditPanel({ agent, onSave, onClose }: AgentEditPanelProps) {
  const [form, setForm] = useState<FormData>(() => toFormData(agent));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormData(agent));
  }, [agent]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        skills: form.skills,
        tools: form.tools,
        permissions: form.permissions,
        knowledgeScopes: form.knowledgeScopes,
        memoryScopes: form.memoryScopes,
        executorPolicy: {
          executor: form.executor,
        },
        modelPolicy: {
          ...(form.preferredModels.length > 0 && { preferredModels: form.preferredModels }),
          ...(form.temperature && { temperature: parseFloat(form.temperature) }),
          ...(form.maxTokens && { maxTokens: parseInt(form.maxTokens, 10) }),
        },
      };
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-data)',
    fontSize: 12,
    color: 'var(--text-primary)',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 6,
    padding: '6px 10px',
    width: '100%',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-data)',
    fontSize: 10,
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-2">
            <Bot size={14} style={{ color: 'var(--cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-hud)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {agent ? 'Edit Agent' : 'Create Agent'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 agents-scroll">
          {/* Name */}
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Agent name"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Skills */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain size={10} style={{ color: 'var(--text-tertiary)' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Skills</label>
            </div>
            <TagInput
              value={form.skills}
              onChange={(v) => update('skills', v)}
              placeholder="Add skill..."
              color="var(--cyan)"
            />
          </div>

          {/* Tools */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wrench size={10} style={{ color: 'var(--text-tertiary)' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Tools</label>
            </div>
            <TagInput
              value={form.tools}
              onChange={(v) => update('tools', v)}
              placeholder="Add tool..."
              color="var(--emerald)"
            />
          </div>

          {/* Permissions */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lock size={10} style={{ color: 'var(--text-tertiary)' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Permissions</label>
            </div>
            <TagInput
              value={form.permissions}
              onChange={(v) => update('permissions', v)}
              placeholder="Add permission..."
              color="var(--amber)"
            />
          </div>

          {/* Knowledge Scopes */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FolderKanban size={10} style={{ color: 'var(--text-tertiary)' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Knowledge Scopes</label>
            </div>
            <TagInput
              value={form.knowledgeScopes}
              onChange={(v) => update('knowledgeScopes', v)}
              placeholder="Add scope..."
              color="rgba(255,255,255,0.4)"
            />
          </div>

          {/* Memory Scopes */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain size={10} style={{ color: 'var(--text-tertiary)' }} />
              <label style={{ ...labelStyle, marginBottom: 0 }}>Memory Scopes</label>
            </div>
            <TagInput
              value={form.memoryScopes}
              onChange={(v) => update('memoryScopes', v)}
              placeholder="Add scope..."
              color="rgba(255,255,255,0.4)"
            />
          </div>

          {/* Executor */}
          <div>
            <label style={labelStyle}>Code Executor</label>
            <div className="grid grid-cols-2 gap-2">
              {(['self', 'claude-code', 'codex', 'opencode'] as const).map((ex) => (
                <button
                  key={ex}
                  onClick={() => update('executor', ex)}
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    color: form.executor === ex ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    background:
                      form.executor === ex ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${form.executor === ex ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Model Config */}
          <div>
            <label style={labelStyle}>Preferred Models</label>
            <TagInput
              value={form.preferredModels}
              onChange={(v) => update('preferredModels', v)}
              placeholder="Add model..."
              color="var(--violet)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Temperature</label>
              <input
                value={form.temperature}
                onChange={(e) => update('temperature', e.target.value)}
                placeholder="0.7"
                type="number"
                step="0.1"
                min="0"
                max="2"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Tokens</label>
              <input
                value={form.maxTokens}
                onChange={(e) => update('maxTokens', e.target.value)}
                placeholder="4096"
                type="number"
                step="256"
                min="256"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--glass-border)' }}
        >
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: saving || !form.name.trim() ? 'var(--text-tertiary)' : 'var(--cyan)',
              background:
                saving || !form.name.trim() ? 'rgba(255,255,255,0.03)' : 'rgba(0,212,255,0.08)',
              border: `1px solid ${saving || !form.name.trim() ? 'rgba(255,255,255,0.06)' : 'rgba(0,212,255,0.15)'}`,
              borderRadius: 6,
              padding: '6px 14px',
              cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : agent ? 'Save Changes' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
