import { ArrowUpRight } from 'lucide-react';

type EntityType = 'run' | 'task' | 'memory' | 'approval' | 'agent' | 'project';

const entityColors: Record<EntityType, string> = {
  run: 'var(--cyan)',
  task: 'var(--emerald)',
  memory: 'var(--amber)',
  approval: 'var(--red)',
  agent: 'var(--cyan)',
  project: 'var(--text-secondary)',
};

interface EntityLinkProps {
  type: EntityType;
  label: string;
  onClick: () => void;
}

export function EntityLink({ type, label, onClick }: EntityLinkProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 transition-opacity hover:opacity-80"
      style={{
        fontFamily: 'var(--font-data)',
        fontSize: 11,
        color: entityColors[type],
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {label}
      <ArrowUpRight size={10} />
    </button>
  );
}
