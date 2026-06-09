import { Bot, Star } from 'lucide-react';
import type { AgentProfile } from '@/stores/agentStore';

interface AgentCardProps {
  agent: AgentProfile;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const roleColors: Record<string, string> = {
  planner: 'var(--violet)',
  coding: 'var(--cyan)',
  review: 'var(--emerald)',
  testing: 'var(--amber)',
  research: '#f472b6',
  general: 'var(--text-tertiary)',
};

export function AgentCard({ agent, isSelected, onSelect }: AgentCardProps) {
  const executorName = (() => {
    if (!agent.executorPolicy || typeof agent.executorPolicy !== 'object') return null;
    const ep = agent.executorPolicy as { executor?: string };
    return ep.executor ?? null;
  })();

  return (
    <button
      className={`agent-card w-full text-left px-3 py-2.5 ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(agent.id)}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Bot
            size={14}
            style={{
              color:
                roleColors[agent.description ? 'general' : 'general'] ?? 'var(--text-tertiary)',
            }}
          />
        </div>
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
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
              borderRadius: 4,
            }}
          >
            <Star size={8} />
            Default
          </span>
        )}
      </div>
      {agent.description && (
        <div
          className="truncate ml-9"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          {agent.description}
        </div>
      )}
      <div className="flex items-center gap-3 mt-1.5 ml-9">
        <span
          className="flex items-center gap-1"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--emerald)',
            }}
          />
          Active
        </span>
        {executorName && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            {executorName}
          </span>
        )}
      </div>
    </button>
  );
}
