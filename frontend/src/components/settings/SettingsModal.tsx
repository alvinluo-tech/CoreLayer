import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { MCPSettings } from './MCPSettings';
import { DbManager } from './DbManager';
import { ModelSettings } from './ModelSettings';
import {
  Database,
  Cloud,
  AlertTriangle,
  Plug,
  MessageSquare,
  ListTodo,
  BookOpen,
  RefreshCw,
  Layers,
  Server,
  Brain,
} from 'lucide-react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'storage' | 'mcp' | 'models' | 'dbManager';

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    storageMode,
    cloudConfigured,
    postgresConfigured,
    isLoading,
    error,
    fetchSettings,
    setStorageMode,
    dbStats,
    isLoadingDbStats,
    fetchDbStats,
  } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('storage');

  useEffect(() => {
    if (open) {
      fetchSettings();
      fetchDbStats();
    }
  }, [open, fetchSettings, fetchDbStats]);

  const handleModeChange = async (mode: 'local' | 'cloud' | 'postgres') => {
    if (mode === storageMode) return;
    await setStorageMode(mode);
    fetchDbStats();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent
        onClose={onClose}
        className={`relative transition-all duration-300 ${
          activeTab === 'dbManager' || activeTab === 'models' ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置 Jarvis 的存储和连接</DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab('storage')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'storage'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="h-4 w-4" />
            存储
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'mcp'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Plug className="h-4 w-4" />
            MCP & 模型
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'models'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Brain className="h-4 w-4" />
            模型
          </button>
          <button
            onClick={() => setActiveTab('dbManager')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'dbManager'
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4" />
            数据管理
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            {/* Storage Mode Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium">存储模式</label>

              <div className="grid grid-cols-3 gap-3">
                {/* Local Mode */}
                <button
                  onClick={() => handleModeChange('local')}
                  disabled={isLoading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    storageMode === 'local'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Database
                    className={`h-8 w-8 ${
                      storageMode === 'local' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium">本地存储</p>
                    <p className="text-xs text-muted-foreground">SQLite 数据库</p>
                  </div>
                </button>

                {/* Supabase Cloud Mode */}
                <button
                  onClick={() => handleModeChange('cloud')}
                  disabled={isLoading || !cloudConfigured}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    storageMode === 'cloud'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${!cloudConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Cloud
                    className={`h-8 w-8 ${
                      storageMode === 'cloud' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium">云端 Supabase</p>
                    <p className="text-xs text-muted-foreground">Hosted Postgres</p>
                  </div>
                </button>

                {/* Direct Postgres Mode */}
                <button
                  onClick={() => handleModeChange('postgres')}
                  disabled={isLoading || !postgresConfigured}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    storageMode === 'postgres'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${!postgresConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Server
                    className={`h-8 w-8 ${
                      storageMode === 'postgres' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium">通用 PG 云端</p>
                    <p className="text-xs text-muted-foreground">Neon/RDS/General</p>
                  </div>
                </button>
              </div>

              {/* Cloud not configured warning */}
              {!cloudConfigured && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Supabase 模式需要配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量。
                  </p>
                </div>
              )}

              {/* Postgres not configured warning */}
              {!postgresConfigured && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    通用 PostgreSQL 模式需要配置 DATABASE_URL (或 POSTGRES_URL) 环境变量。
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

            {/* Database Health Diagnostic Panel */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </div>
                  <h4 className="text-sm font-semibold tracking-tight text-foreground">
                    数据健康诊断
                  </h4>
                </div>
                <button
                  onClick={() => fetchDbStats()}
                  disabled={isLoadingDbStats}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingDbStats ? 'animate-spin' : ''}`} />
                  刷新诊断
                </button>
              </div>

              {dbStats ? (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {/* File Size */}
                  <div className="p-3 rounded-lg bg-card border border-border flex flex-col justify-between space-y-1">
                    <span className="text-xs text-muted-foreground">数据库大小</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-mono font-semibold text-foreground">
                        {dbStats.dbSize}
                      </span>
                    </div>
                  </div>

                  {/* Conversations */}
                  <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-xs text-muted-foreground block">会话历史</span>
                      <span className="text-lg font-mono font-semibold text-foreground">
                        {dbStats.entryCount.conversations}{' '}
                        <span className="text-xs text-muted-foreground font-normal">个会话</span>
                      </span>
                    </div>
                    <MessageSquare className="h-4 w-4 text-muted-foreground/70" />
                  </div>

                  {/* Tasks */}
                  <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-xs text-muted-foreground block">任务执行</span>
                      <span className="text-lg font-mono font-semibold text-foreground">
                        {dbStats.entryCount.tasks}{' '}
                        <span className="text-xs text-muted-foreground font-normal">个任务</span>
                      </span>
                    </div>
                    <ListTodo className="h-4 w-4 text-muted-foreground/70" />
                  </div>

                  {/* Articles */}
                  <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-xs text-muted-foreground block">阅读列表</span>
                      <span className="text-lg font-mono font-semibold text-foreground">
                        {dbStats.entryCount.articles}{' '}
                        <span className="text-xs text-muted-foreground font-normal">篇文章</span>
                      </span>
                    </div>
                    <BookOpen className="h-4 w-4 text-muted-foreground/70" />
                  </div>
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center border border-dashed border-border rounded-lg bg-card/30">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>正在诊断数据健康状态...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Error display */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Current mode indicator */}
            <div className="text-center pt-1">
              <p className="text-xs text-muted-foreground">
                当前模式:{' '}
                <span className="font-medium text-foreground">
                  {storageMode === 'local' ? '本地 SQLite' : '云端 Supabase'}
                </span>
              </p>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && <MCPSettings className="max-h-[60vh] overflow-y-auto pr-1" />}
        {activeTab === 'models' && <ModelSettings className="max-h-[60vh] overflow-y-auto pr-1" />}
        {activeTab === 'dbManager' && <DbManager className="max-h-[65vh] overflow-y-auto pr-1" />}
      </DialogContent>
    </Dialog>
  );
}
