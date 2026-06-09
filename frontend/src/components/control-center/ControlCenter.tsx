import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  LayoutDashboard,
  Server,
  Brain,
  Plug,
  Wrench,
  Shield,
  Mic,
  Activity,
  Database,
  Palette,
  Bot,
} from 'lucide-react';
import { OverviewPage } from './OverviewPage';
import { SystemPage } from './SystemPage';
import { ModelsPage } from './ModelsPage';
import { AppsPage } from './AppsPage';
import { ToolsPage } from './ToolsPage';
import { PermissionPage } from './PermissionPage';
import { VoicePage } from './VoicePage';
import { DaemonPage } from './DaemonPage';
import { DbPage } from './DbPage';
import { AppearancePage } from './AppearancePage';
import { AgentRuntimesPage } from './AgentRuntimesPage';

export type ControlPage =
  | 'overview'
  | 'system'
  | 'models'
  | 'apps'
  | 'tools'
  | 'permission'
  | 'runtimes'
  | 'voice'
  | 'daemon'
  | 'db'
  | 'appearance';

interface ControlCenterProps {
  onBack: () => void;
  initialPage?: ControlPage;
}

const navItems: { id: ControlPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'system', label: 'System', icon: Server },
  { id: 'models', label: 'Models', icon: Brain },
  { id: 'apps', label: 'Apps & MCP', icon: Plug },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'permission', label: 'Permissions', icon: Shield },
  { id: 'runtimes', label: 'Agent Runtimes', icon: Bot },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'daemon', label: 'Daemon', icon: Activity },
  { id: 'db', label: 'Database', icon: Database },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

const pages: Record<ControlPage, React.ComponentType> = {
  overview: OverviewPage,
  system: SystemPage,
  models: ModelsPage,
  apps: AppsPage,
  tools: ToolsPage,
  permission: PermissionPage,
  runtimes: AgentRuntimesPage,
  voice: VoicePage,
  daemon: DaemonPage,
  db: DbPage,
  appearance: AppearancePage,
};

export function ControlCenter({ onBack, initialPage }: ControlCenterProps) {
  const [activePage, setActivePage] = useState<ControlPage>(initialPage ?? 'overview');
  const PageComponent = pages[activePage];

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-void)' }}>
      {/* Left sidebar nav — glass panel */}
      <aside
        className="w-52 flex flex-col overflow-hidden"
        style={{
          background: 'rgba(4,6,14,0.6)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid var(--glass-border)',
        }}
      >
        <header className="p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 -ml-1 mb-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: 1 }}>
              BACK
            </span>
          </Button>
          <h1
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 2,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            Control Center
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: 1,
              color: 'var(--text-tertiary)',
              marginTop: 4,
            }}
          >
            JARVIS SYSTEM MANAGEMENT
          </p>
        </header>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition-all duration-200 text-left"
                style={{
                  background: isActive ? 'var(--glass-bg)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(0,212,255,0.12)' : 'transparent'}`,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                <Icon className="h-4 w-4" />
                <span
                  style={{
                    fontFamily: 'var(--font-hud)',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: 0.5,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right content area */}
      <main className="flex-1 overflow-y-auto p-6">
        <PageComponent />
      </main>
    </div>
  );
}
