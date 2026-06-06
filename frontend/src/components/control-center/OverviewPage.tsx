import { useEffect, useState } from 'react';

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}
import { Server, Brain, Plug, Wrench, Mic, Database, Activity, BarChart3 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { useMCPStore } from '@/stores/mcpStore';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getDaemonStatus,
  getVoiceStatus,
  getHealth,
  getUsageStats,
  type DaemonStatus,
  type VoiceStatus,
  type UsageStats,
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
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

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
    getUsageStats()
      .then(setUsageStats)
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
      title: 'Daemon',
      icon: Server,
      status: daemon?.healthy ? 'healthy' : daemon?.running ? 'warning' : 'error',
      statusLabel: daemon?.healthy ? 'Running' : daemon?.running ? 'Unhealthy' : 'Offline',
      detail: daemon?.url ?? 'Unknown',
    },
    {
      title: 'AI Model',
      icon: Brain,
      status: health ? 'healthy' : 'idle',
      statusLabel: health?.aiModel ?? 'Not Connected',
      detail: health?.aiProvider ?? '',
    },
    {
      title: 'MCP Servers',
      icon: Plug,
      status: connectedServers > 0 ? 'healthy' : servers.length > 0 ? 'warning' : 'idle',
      statusLabel: `${connectedServers} / ${servers.length} Connected`,
      detail: `${servers.length} servers`,
    },
    {
      title: 'Tool Registry',
      icon: Wrench,
      status: totalTools > 0 ? 'healthy' : 'idle',
      statusLabel: `${totalTools} Tools`,
      detail: `Native ${toolCounts.native} · MCP ${toolCounts.mcp} · Skill ${toolCounts.skill}`,
    },
    {
      title: 'Voice System',
      icon: Mic,
      status: voiceStatus?.asr ? 'healthy' : voiceStatus ? 'warning' : 'idle',
      statusLabel: voiceStatus?.asr ? 'Available' : voiceStatus ? 'Partial' : 'Checking',
      detail: `TTS: ${voiceStatus?.tts?.provider ?? 'Unknown'}`,
    },
    {
      title: 'Storage',
      icon: Database,
      status: storageMode === 'cloud' ? 'healthy' : 'idle',
      statusLabel: storageMode === 'cloud' ? 'Cloud' : 'Local',
      detail: storageMode === 'local' ? 'SQLite' : 'Supabase',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section header — HUD label */}
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
          }}
        >
          System Overview
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: 1,
            color: 'var(--text-tertiary)',
            marginTop: 4,
          }}
        >
          SUBSYSTEM STATUS MONITOR
        </p>
      </div>

      {/* Status cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="p-4 rounded-xl transition-all duration-200 hover:border-[var(--glass-border-hover)]"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
                  <span
                    style={{
                      fontFamily: 'var(--font-hud)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 1,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {card.title}
                  </span>
                </div>
                <StatusBadge status={card.status} label={card.statusLabel} />
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: 0.5,
                }}
              >
                {card.detail}
              </p>
            </div>
          );
        })}
      </div>

      {/* Model info */}
      {modelProfiles.length > 0 && (
        <div
          className="p-4 rounded-xl"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <h3
            className="flex items-center gap-2 mb-3"
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            <Activity className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            Loaded Models
          </h3>
          <div className="flex flex-wrap gap-2">
            {modelProfiles.map((p) => (
              <span
                key={p.id}
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  background: 'rgba(0,212,255,0.06)',
                  border: '1px solid rgba(0,212,255,0.1)',
                  color: 'var(--cyan)',
                }}
              >
                {p.displayName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Usage stats */}
      {usageStats && (
        <div
          className="p-4 rounded-xl"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <h3
            className="flex items-center gap-2 mb-3"
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            <BarChart3 className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
            Usage Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            {[
              { label: 'Conversations', value: usageStats.totalConversations },
              { label: 'Total Tokens', value: formatTokenCount(usageStats.totalTokens) },
              { label: 'Input Tokens', value: formatTokenCount(usageStats.totalPromptTokens) },
              { label: 'Output Tokens', value: formatTokenCount(usageStats.totalCompletionTokens) },
            ].map((stat) => (
              <div key={stat.label}>
                <p
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    letterSpacing: 0.5,
                  }}
                >
                  {stat.label}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-hud)',
                    fontSize: 20,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
          {usageStats.models.length > 0 && (
            <div
              className="pt-3 mt-2 space-y-2"
              style={{ borderTop: '1px solid var(--glass-border)' }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: 0.5,
                }}
              >
                BY MODEL
              </p>
              {usageStats.models.map((m) => (
                <div key={m.modelId} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>{m.displayName}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {formatTokenCount(m.totalTokens)} · ${m.estimatedCostUsd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
