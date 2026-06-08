import { useEffect, useState } from 'react';
import { useConversationStore } from '@/stores/conversationStore';
import { useRunStore } from '@/stores/runStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useAgentStore } from '@/stores/agentStore';
import { jarvisClient } from '@/lib/jarvisClient';

interface DaemonStatus {
  connected: boolean;
  runtimeMode?: string;
  uptime?: number;
  memoryPercent?: number;
  cpuUsagePercent?: number;
  diskFreeGb?: number;
  externalProcessCount?: number;
  lastError?: string;
}

/**
 * Fixed bottom status bar showing version, daemon health, and runtime metrics.
 */
export function BottomStatusBar() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const runs = useRunStore((s) => s.runs);
  const pendingCount = useApprovalStore((s) => s.pendingCount);
  const agents = useAgentStore((s) => s.agents);

  const [daemon, setDaemon] = useState<DaemonStatus>({ connected: false });

  const activeRunCount = runs.filter((r) => r.status === 'running').length;
  const queuedRunCount = runs.filter((r) => r.status === 'queued').length;
  const defaultAgent = agents.find((a) => a.isDefault);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const raw = await jarvisClient.get('/api/runtime/status');
        if (!alive) return;
        const data = raw as Record<string, unknown>;
        setDaemon({
          connected: true,
          runtimeMode: data.runtimeMode as string | undefined,
          uptime: data.uptime as number | undefined,
          memoryPercent: data.memoryPercent as number | undefined,
          cpuUsagePercent: data.cpuUsagePercent as number | undefined,
          diskFreeGb: data.diskFreeGb as number | undefined,
          externalProcessCount: data.externalProcessCount as number | undefined,
          lastError: data.lastError as string | undefined,
        });
      } catch {
        if (alive) setDaemon({ connected: false });
      }
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const resourcePressure = (daemon.memoryPercent ?? 0) > 85 || (daemon.cpuUsagePercent ?? 0) > 90;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'rgba(4,6,14,0.85)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--glass-border)',
        fontFamily: 'var(--font-data)',
        fontSize: 9,
        color: 'var(--text-tertiary)',
        letterSpacing: 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, var(--cyan-glow), transparent)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span>JARVIS v{__APP_VERSION__}</span>
        <span>·</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: daemon.connected ? '#22c55e' : '#ef4444',
              boxShadow: daemon.connected ? '0 0 4px #22c55e' : '0 0 4px #ef4444',
            }}
          />
          {daemon.connected ? 'DAEMON' : 'OFFLINE'}
        </span>
        {daemon.runtimeMode && (
          <>
            <span>·</span>
            <span>{daemon.runtimeMode.toUpperCase()}</span>
          </>
        )}
        {daemon.uptime != null && (
          <>
            <span>·</span>
            <span>UP {formatUptime(daemon.uptime)}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {defaultAgent && (
          <span style={{ color: 'var(--text-secondary)' }}>AGENT: {defaultAgent.name}</span>
        )}
        {activeRunCount > 0 && <span style={{ color: 'var(--cyan)' }}>RUNS {activeRunCount}</span>}
        {queuedRunCount > 0 && (
          <span style={{ color: 'var(--text-secondary)' }}>QUEUED {queuedRunCount}</span>
        )}
        {pendingCount() > 0 && (
          <span style={{ color: 'var(--amber)' }}>PENDING {pendingCount()}</span>
        )}
        {resourcePressure && (
          <span style={{ color: 'var(--amber)' }}>
            CPU {daemon.cpuUsagePercent ?? 0}% · MEM {daemon.memoryPercent ?? 0}%
          </span>
        )}
        {daemon.lastError && (
          <span style={{ color: 'var(--rose)' }} title={daemon.lastError}>
            ERROR
          </span>
        )}
        <span>SESSION: {activeConversationId?.slice(0, 4).toUpperCase() ?? '—'}</span>
      </div>
    </div>
  );
}
