import { useState } from 'react';
import { Search, Plus, Download, Bot } from 'lucide-react';
import { FilterTabs } from '@/components/ui/agent-os';
import { EmptyState } from '@/components/ui/agent-os';
import { AgentCard } from './AgentCard';
import type { AgentProfile } from '@/stores/agentStore';

type RoleFilter = 'all' | 'planner' | 'coding' | 'review' | 'testing' | 'general';

interface AgentListPanelProps {
  agents: AgentProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}

const roleTabs: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'planner', label: 'Planner' },
  { value: 'coding', label: 'Coding' },
  { value: 'review', label: 'Review' },
  { value: 'testing', label: 'Testing' },
  { value: 'general', label: 'General' },
];

export function AgentListPanel({
  agents,
  selectedId,
  onSelect,
  onCreate,
  onImport,
}: AgentListPanelProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const filtered = agents.filter((agent) => {
    const matchesSearch =
      !search ||
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.description?.toLowerCase().includes(search.toLowerCase());
    // Role filter: in Phase 1, all agents are "general" since role field doesn't exist yet
    // Once Phase 2 adds role field, filter by agent.role
    return matchesSearch;
  });

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 280,
        borderRight: '1px solid var(--glass-border)',
        background: 'rgba(4,6,14,0.4)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span className="hud-label">Agent Profiles ({agents.length})</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onImport}
            className="flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            title="Import agent"
          >
            <Download size={12} />
          </button>
          <button
            onClick={onCreate}
            className="flex items-center gap-1"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            <Plus size={10} />
            New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="relative">
          <Search
            size={12}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '5px 8px 5px 26px',
              width: '100%',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Role Filter */}
      <FilterTabs tabs={roleTabs} active={roleFilter} onChange={setRoleFilter} />

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto agents-scroll">
        {filtered.length === 0 ? (
          agents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents yet"
              message="Create your first agent profile to get started."
              action={{ label: '+ New Agent', onClick: onCreate }}
            />
          ) : (
            <div
              className="flex items-center justify-center py-8"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--text-tertiary)',
              }}
            >
              No agents match your search
            </div>
          )
        ) : (
          filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
