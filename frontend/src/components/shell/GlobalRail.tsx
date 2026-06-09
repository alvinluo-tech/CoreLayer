import {
  MessageSquare,
  ListTodo,
  Activity,
  Brain,
  ShieldCheck,
  FolderKanban,
  Layers,
  Bot,
  Settings,
} from 'lucide-react';
import type { ShellView } from '@/stores/shellStore';

interface RailItem {
  view: ShellView;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

interface GlobalRailProps {
  activeView: ShellView;
  onViewChange: (view: ShellView) => void;
  pendingApprovalCount?: number;
  runningRunCount?: number;
}

const navItems: Omit<RailItem, 'badge'>[] = [
  { view: 'assistant', icon: <MessageSquare size={20} />, label: 'Assistant' },
  { view: 'tasks', icon: <ListTodo size={20} />, label: 'Tasks' },
  { view: 'runs', icon: <Activity size={20} />, label: 'Runs' },
  { view: 'memory', icon: <Brain size={20} />, label: 'Memory' },
  { view: 'approvals', icon: <ShieldCheck size={20} />, label: 'Approvals' },
  { view: 'projects', icon: <Layers size={20} />, label: 'Projects' },
  { view: 'agents', icon: <Bot size={20} />, label: 'Agents' },
  { view: 'workspace', icon: <FolderKanban size={20} />, label: 'Workspace' },
];

export function GlobalRail({
  activeView,
  onViewChange,
  pendingApprovalCount,
  runningRunCount,
}: GlobalRailProps) {
  return (
    <nav
      className="flex flex-col items-center py-3 gap-1"
      style={{
        width: 56,
        background: 'rgba(4,6,14,0.8)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid var(--glass-border)',
        flexShrink: 0,
      }}
    >
      {/* Navigation items */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = activeView === item.view;
          const showApprovalBadge = item.view === 'approvals' && pendingApprovalCount;
          const showRunPulse = item.view === 'runs' && runningRunCount;

          return (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              title={item.label}
              className="relative flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--r-md)',
                border: isActive ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
                color: isActive ? 'var(--cyan)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {item.icon}

              {/* Approval pending badge */}
              {showApprovalBadge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    boxShadow: '0 0 6px rgba(255,184,0,0.4)',
                  }}
                />
              )}

              {/* Running run pulse */}
              {showRunPulse && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--cyan)',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: Control Center */}
      <button
        onClick={() => onViewChange('control-center')}
        title="Control Center"
        className="flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--r-md)',
          border:
            activeView === 'control-center'
              ? '1px solid rgba(0,212,255,0.3)'
              : '1px solid transparent',
          background: activeView === 'control-center' ? 'rgba(0,212,255,0.08)' : 'transparent',
          color: activeView === 'control-center' ? 'var(--cyan)' : 'var(--text-tertiary)',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          if (activeView !== 'control-center') {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          }
        }}
        onMouseLeave={(e) => {
          if (activeView !== 'control-center') {
            e.currentTarget.style.color = 'var(--text-tertiary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <Settings size={20} />
      </button>
    </nav>
  );
}
