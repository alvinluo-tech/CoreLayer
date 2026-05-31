import { useEffect, useState } from 'react';
import { Server, Brain, Plug, Wrench, Mic, Database, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { useMCPStore } from '@/stores/mcpStore';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getDaemonStatus,
  getVoiceStatus,
  getHealth,
  type DaemonStatus,
  type VoiceStatus,
} from '@/lib/tauri';

export function OverviewPage() {
  const { servers, toolCounts, fetchServers, fetchTools } = useMCPStore();
  const { modelProfiles, fetchAll: fetchModels } = useModelStore();
  const { storageMode, fetchSettings } = useSettingsStore();
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [health, setHealth] = useState<{
    status: string;
    aiProvider: string;
    aiModel: string;
  } | null>(null);

  useEffect(() => {
    fetchServers();
    fetchTools();
    fetchModels();
    fetchSettings();
    getDaemonStatus()
      .then(setDaemon)
      .catch(() => {});
    getVoiceStatus()
      .then(setVoiceStatus)
      .catch(() => {});
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, [fetchServers, fetchTools, fetchModels, fetchSettings]);

  const connectedServers = servers.filter((s) => s.status === 'connected').length;
  const totalTools = toolCounts.native + toolCounts.mcp + toolCounts.skill + toolCounts.rest;

  const cards: {
    title: string;
    icon: typeof Server;
    status: 'healthy' | 'warning' | 'error' | 'idle';
    statusLabel: string;
    detail: string;
  }[] = [
    {
      title: '守护进程',
      icon: Server,
      status: daemon?.healthy ? 'healthy' : daemon?.running ? 'warning' : 'error',
      statusLabel: daemon?.healthy ? '运行中' : daemon?.running ? '异常' : '未运行',
      detail: daemon?.url ?? '未知',
    },
    {
      title: 'AI 模型',
      icon: Brain,
      status: health ? 'healthy' : 'idle',
      statusLabel: health?.aiModel ?? '未连接',
      detail: health?.aiProvider ?? '',
    },
    {
      title: 'MCP 服务器',
      icon: Plug,
      status: connectedServers > 0 ? 'healthy' : servers.length > 0 ? 'warning' : 'idle',
      statusLabel: `${connectedServers} / ${servers.length} 已连接`,
      detail: `${servers.length} 个服务器`,
    },
    {
      title: '工具注册表',
      icon: Wrench,
      status: totalTools > 0 ? 'healthy' : 'idle',
      statusLabel: `${totalTools} 个工具`,
      detail: `原生 ${toolCounts.native} · MCP ${toolCounts.mcp} · 技能 ${toolCounts.skill}`,
    },
    {
      title: '语音系统',
      icon: Mic,
      status: voiceStatus?.asr ? 'healthy' : voiceStatus ? 'warning' : 'idle',
      statusLabel: voiceStatus?.asr ? '可用' : voiceStatus ? '部分可用' : '检测中',
      detail: `TTS: ${voiceStatus?.tts?.provider ?? '未知'}`,
    },
    {
      title: '存储模式',
      icon: Database,
      status: storageMode === 'cloud' ? 'healthy' : 'idle',
      statusLabel: storageMode === 'cloud' ? '云端' : '本地',
      detail: storageMode === 'local' ? 'SQLite' : 'Supabase',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">系统总览</h2>
        <p className="text-sm text-muted-foreground">Jarvis 各子系统运行状态</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{card.title}</span>
                </div>
                <StatusBadge status={card.status} label={card.statusLabel} />
              </div>
              <p className="text-xs text-muted-foreground">{card.detail}</p>
            </Card>
          );
        })}
      </div>

      {/* Model info */}
      {modelProfiles.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4" />
            已加载模型
          </h3>
          <div className="flex flex-wrap gap-2">
            {modelProfiles.map((p) => (
              <span
                key={p.id}
                className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
              >
                {p.displayName}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
