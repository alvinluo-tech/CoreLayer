import {
  Activity,
  Zap,
  Clock,
  TrendingUp,
  FolderOpen,
  FlaskConical,
  Play,
  Trash2,
  Bot,
} from 'lucide-react';
import { MetaLabel, MetaValue, MetaGrid, StatusPill } from '@/components/ui/agent-os';
import type { AgentProfile } from '@/stores/agentStore';

interface AgentInspectorPanelProps {
  agent: AgentProfile;
  onTest: () => void;
  onDelete: () => void;
}

function StatCell({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="stat-cell">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={10} style={{ color }} />
        <span
          style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--text-tertiary)' }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function AgentInspectorPanel({ agent, onTest, onDelete }: AgentInspectorPanelProps) {
  const modelPolicy = agent.modelPolicy as Record<string, unknown> | null;
  const preferredModels = modelPolicy?.preferredModels as string[] | undefined;
  const temperature = modelPolicy?.temperature as number | undefined;
  const maxTokens = modelPolicy?.maxTokens as number | undefined;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 300,
        borderLeft: '1px solid var(--glass-border)',
        background: 'rgba(4,6,14,0.4)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <Activity size={12} style={{ color: 'var(--text-tertiary)' }} />
        <span className="hud-label">Inspector</span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 agents-scroll">
        {/* Availability */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center justify-between mb-2">
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Availability
            </span>
            <StatusPill label="Active" color="var(--emerald)" />
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--emerald)',
                boxShadow: '0 0 6px rgba(0,230,138,0.4)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              Ready to execute
            </span>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={10} style={{ color: 'var(--text-tertiary)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Usage Stats
            </span>
          </div>
          <div className="stats-grid">
            <StatCell icon={Play} label="Total Runs" value="—" color="var(--cyan)" />
            <StatCell icon={Zap} label="Tokens Used" value="—" color="var(--amber)" />
            <StatCell icon={TrendingUp} label="Success Rate" value="—" color="var(--emerald)" />
            <StatCell icon={Clock} label="Avg Duration" value="—" color="var(--violet)" />
          </div>
        </div>

        {/* Used In */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen size={10} style={{ color: 'var(--text-tertiary)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Used In
            </span>
          </div>
          <div
            className="flex items-center justify-center py-3"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            No workspaces assigned
          </div>
        </div>

        {/* Test Result */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical size={10} style={{ color: 'var(--text-tertiary)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Last Test
            </span>
          </div>
          <div
            className="flex items-center justify-center py-3"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Not tested yet
          </div>
        </div>

        {/* Model Config Summary */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2 mb-2">
            <Bot size={10} style={{ color: 'var(--text-tertiary)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Model Config
            </span>
          </div>
          {preferredModels && preferredModels.length > 0 ? (
            <MetaGrid>
              <MetaLabel>Preferred</MetaLabel>
              <MetaValue>{preferredModels.join(', ')}</MetaValue>
              {temperature !== undefined && (
                <>
                  <MetaLabel>Temperature</MetaLabel>
                  <MetaValue>{temperature}</MetaValue>
                </>
              )}
              {maxTokens !== undefined && (
                <>
                  <MetaLabel>Max Tokens</MetaLabel>
                  <MetaValue>{maxTokens.toLocaleString()}</MetaValue>
                </>
              )}
            </MetaGrid>
          ) : (
            <div
              className="flex items-center justify-center py-3"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              Using defaults
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-3" style={{ borderRadius: 8 }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={10} style={{ color: 'var(--text-tertiary)' }} />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              Quick Actions
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={onTest}
              className="flex items-center gap-2 w-full text-left"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--emerald)',
                background: 'rgba(0,230,138,0.06)',
                border: '1px solid rgba(0,230,138,0.12)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <FlaskConical size={12} />
              Test Agent
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-2 w-full text-left"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--rose)',
                background: 'rgba(255,75,75,0.06)',
                border: '1px solid rgba(255,75,75,0.12)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Trash2 size={12} />
              Delete Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
