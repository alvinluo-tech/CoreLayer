import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { MCPSettings } from "./MCPSettings";
import { Database, Cloud, AlertTriangle, Plug } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "storage" | "mcp";

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { storageMode, cloudConfigured, isLoading, error, fetchSettings, setStorageMode } =
    useSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("storage");

  useEffect(() => {
    if (open) {
      fetchSettings();
    }
  }, [open, fetchSettings]);

  const handleModeChange = async (mode: "local" | "cloud") => {
    if (mode === storageMode) return;
    await setStorageMode(mode);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent onClose={onClose} className="relative max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置 Jarvis 的存储和连接</DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab("storage")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "storage"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-4 w-4" />
            存储
          </button>
          <button
            onClick={() => setActiveTab("mcp")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "mcp"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plug className="h-4 w-4" />
            MCP & 模型
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "storage" && (
          <div className="space-y-4">
            {/* Storage Mode Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium">存储模式</label>

              <div className="grid grid-cols-2 gap-3">
                {/* Local Mode */}
                <button
                  onClick={() => handleModeChange("local")}
                  disabled={isLoading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    storageMode === "local"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Database
                    className={`h-8 w-8 ${
                      storageMode === "local" ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium">本地存储</p>
                    <p className="text-xs text-muted-foreground">SQLite 数据库</p>
                  </div>
                </button>

                {/* Cloud Mode */}
                <button
                  onClick={() => handleModeChange("cloud")}
                  disabled={isLoading || !cloudConfigured}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    storageMode === "cloud"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  } ${!cloudConfigured ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Cloud
                    className={`h-8 w-8 ${
                      storageMode === "cloud" ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium">云端存储</p>
                    <p className="text-xs text-muted-foreground">Supabase PostgreSQL</p>
                  </div>
                </button>
              </div>

              {/* Cloud not configured warning */}
              {!cloudConfigured && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    云端模式需要配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量。
                  </p>
                </div>
              )}

              {/* Switch warning */}
              <div className="flex items-start gap-2 p-3 rounded-md bg-muted">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  切换存储模式不会迁移已有数据。每种模式使用独立的数据存储。
                </p>
              </div>
            </div>

            {/* Error display */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Current mode indicator */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                当前模式:{" "}
                <span className="font-medium text-foreground">
                  {storageMode === "local" ? "本地 SQLite" : "云端 Supabase"}
                </span>
              </p>
            </div>
          </div>
        )}

        {activeTab === "mcp" && <MCPSettings className="max-h-[60vh] overflow-y-auto pr-1" />}
      </DialogContent>
    </Dialog>
  );
}
