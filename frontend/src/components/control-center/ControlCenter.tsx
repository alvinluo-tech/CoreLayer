import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  LayoutDashboard,
  Server,
  Brain,
  Plug,
  Wrench,
  Mic,
  Database,
} from "lucide-react";
import { OverviewPage } from "./OverviewPage";
import { SystemPage } from "./SystemPage";
import { ModelsPage } from "./ModelsPage";
import { AppsPage } from "./AppsPage";
import { ToolsPage } from "./ToolsPage";
import { VoicePage } from "./VoicePage";
import { DbPage } from "./DbPage";

export type ControlPage =
  | "overview"
  | "system"
  | "models"
  | "apps"
  | "tools"
  | "voice"
  | "db";

interface ControlCenterProps {
  onBack: () => void;
}

const navItems: { id: ControlPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "system", label: "系统", icon: Server },
  { id: "models", label: "模型", icon: Brain },
  { id: "apps", label: "应用 & MCP", icon: Plug },
  { id: "tools", label: "工具", icon: Wrench },
  { id: "voice", label: "语音", icon: Mic },
  { id: "db", label: "数据管理", icon: Database },
];

const pages: Record<ControlPage, React.ComponentType> = {
  overview: OverviewPage,
  system: SystemPage,
  models: ModelsPage,
  apps: AppsPage,
  tools: ToolsPage,
  voice: VoicePage,
  db: DbPage,
};

export function ControlCenter({ onBack }: ControlCenterProps) {
  const [activePage, setActivePage] = useState<ControlPage>("overview");
  const PageComponent = pages[activePage];

  return (
    <div className="flex h-full bg-background">
      {/* Left sidebar nav */}
      <aside className="w-56 border-r border-border flex flex-col overflow-hidden">
        <header className="p-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <h1 className="text-lg font-bold tracking-tight">控制中心</h1>
          <p className="text-xs text-muted-foreground">Jarvis 系统管理</p>
        </header>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
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
