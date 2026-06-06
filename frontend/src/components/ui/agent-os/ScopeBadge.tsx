import { User, Globe, FolderKanban, Bot, ListTodo, MessageSquare } from 'lucide-react';

type ScopeType = 'user' | 'workspace' | 'project' | 'agent' | 'task' | 'conversation';

const scopeIcons: Record<ScopeType, React.ReactNode> = {
  user: <User size={10} />,
  workspace: <Globe size={10} />,
  project: <FolderKanban size={10} />,
  agent: <Bot size={10} />,
  task: <ListTodo size={10} />,
  conversation: <MessageSquare size={10} />,
};

const scopeLabels: Record<ScopeType, string> = {
  user: 'USER',
  workspace: 'WORKSPACE',
  project: 'PROJECT',
  agent: 'AGENT',
  task: 'TASK',
  conversation: 'CONV',
};

interface ScopeBadgeProps {
  scope: ScopeType;
  id?: string | null;
}

export function ScopeBadge({ scope, id }: ScopeBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        fontFamily: 'var(--font-data)',
        fontSize: 9,
        color: 'var(--text-tertiary)',
        background: 'rgba(255,255,255,0.04)',
        padding: '1px 5px',
        borderRadius: 3,
        border: '1px solid var(--glass-border)',
      }}
    >
      {scopeIcons[scope]}
      {scopeLabels[scope]}
      {id && `:${id.slice(0, 6)}`}
    </span>
  );
}
