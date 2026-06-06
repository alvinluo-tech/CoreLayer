import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { SettingsCard } from './SettingsCard';
import { useModelStore } from '@/stores/modelStore';
import { Server, RefreshCw, Loader2, Clock, AlertTriangle, RotateCw, Activity } from 'lucide-react';
import {
  getDaemonStatus,
  getHealth,
  restartDaemon,
  getTickConfig,
  updateTickConfig,
  type DaemonStatus,
  type TickConfig,
} from '@/lib/tauri';

const intervalOptions = [
  { value: '15', label: '15 分钟' },
  { value: '30', label: '30 分钟' },
  { value: '60', label: '60 分钟' },
  { value: '120', label: '120 分钟' },
] as const;

export function SystemPage() {
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [health, setHealth] = useState<{
    status: string;
    storageMode: string;
    aiProvider: string;
    aiModel: string;
    timestamp: string;
  } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [tick, setTick] = useState<TickConfig | null>(null);
  const [tickSaving, setTickSaving] = useState(false);

  const { modelProfiles, fetchAll: fetchModels } = useModelStore();

  const fetchData = async () => {
    const [d, h, t] = await Promise.allSettled([getDaemonStatus(), getHealth(), getTickConfig()]);
    if (d.status === 'fulfilled') setDaemon(d.value);
    if (h.status === 'fulfilled') setHealth(h.value);
    if (t.status === 'fulfilled') setTick(t.value);
  };

  useEffect(() => {
    fetchData();
    fetchModels();
  }, []);

  const saveTick = async (patch: Partial<TickConfig>) => {
    if (!tick) return;
    setTickSaving(true);
    try {
      const result = await updateTickConfig(patch);
      if (result.config) setTick(result.config);
    } catch (err) {
      console.error('Failed to update TICK config:', err);
    } finally {
      setTickSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    setRestartError(null);
    try {
      const result = await restartDaemon();
      setDaemon(result);
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('重启守护进程失败:', err);
      setRestartError(message);
      await fetchData();
    } finally {
      setRestarting(false);
    }
  };

  const daemonStatus = daemon?.healthy
    ? ('healthy' as const)
    : daemon?.running
      ? ('warning' as const)
      : ('error' as const);

  const daemonLabel = daemon?.healthy ? '运行中' : daemon?.running ? '异常' : '未运行';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">系统状态</h2>
        <p className="text-sm text-muted-foreground">守护进程和基础设施监控</p>
      </div>

      {/* Daemon Card */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Daemon 守护进程</h3>
          </div>
          <StatusBadge status={daemonStatus} label={daemonLabel} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">URL</p>
            <p className="font-mono text-xs mt-0.5">{daemon?.url ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">重启次数</p>
            <p className="mt-0.5">{daemon?.restartAttempts ?? 0} / 3</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">最后健康检查</p>
            <p className="mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {daemon?.lastHealthCheck
                ? !isNaN(Number(daemon.lastHealthCheck))
                  ? new Date(Number(daemon.lastHealthCheck)).toLocaleString('zh-CN')
                  : new Date(daemon.lastHealthCheck).toString() !== 'Invalid Date'
                    ? new Date(daemon.lastHealthCheck).toLocaleString('zh-CN')
                    : daemon.lastHealthCheck
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">最后错误</p>
            <p className="mt-0.5 flex items-center gap-1">
              {daemon?.lastError ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-600 text-xs">{daemon.lastError}</span>
                </>
              ) : (
                '无'
              )}
            </p>
          </div>
        </div>

        {restartError && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>重启失败: {restartError}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            disabled={restarting}
            className="gap-1.5"
          >
            {restarting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            重启
          </Button>
        </div>
      </Card>

      {/* Health Checks Table */}
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">健康检查</h3>
        <div className="space-y-2">
          {[
            {
              name: 'Daemon',
              ok: daemon?.healthy ?? false,
            },
            {
              name: '数据库',
              ok: health?.status === 'ok',
            },
            {
              name: 'AI Provider',
              ok: !!health?.aiProvider,
            },
          ].map((check) => (
            <div
              key={check.name}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
            >
              <span className="text-sm">{check.name}</span>
              <StatusBadge
                status={check.ok ? 'healthy' : 'error'}
                label={check.ok ? '正常' : '异常'}
              />
            </div>
          ))}
        </div>
        {health?.timestamp && (
          <p className="text-xs text-muted-foreground mt-3">
            检查时间: {new Date(health.timestamp).toLocaleString('zh-CN')}
          </p>
        )}
      </Card>

      {/* TICK Settings */}
      <SettingsCard title="TICK 自主处理" icon={Activity}>
        <p
          className="text-xs mb-4"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)' }}
        >
          后台自主任务循环，定期检查待办、阅读和记忆。
        </p>

        {tick && (
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">启用 TICK</span>
              <button
                onClick={() => saveTick({ enabled: !tick.enabled })}
                disabled={tickSaving}
                className="relative w-10 h-5 rounded-full transition-colors duration-200"
                style={{
                  background: tick.enabled ? 'var(--cyan)' : 'var(--glass-border)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                  style={{
                    transform: tick.enabled ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            {/* Interval */}
            <div>
              <span className="text-sm block mb-2">执行间隔</span>
              <div
                className="inline-flex rounded-lg p-0.5"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                {intervalOptions.map((opt) => {
                  const val = Number(opt.value);
                  const isActive = tick.intervalMinutes === val;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => saveTick({ intervalMinutes: val })}
                      disabled={tickSaving}
                      className="px-3 py-1.5 rounded-md text-xs transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-hud)',
                        fontWeight: isActive ? 600 : 400,
                        letterSpacing: 0.5,
                        background: isActive ? 'rgba(0,212,255,0.1)' : 'transparent',
                        color: isActive ? 'var(--cyan)' : 'var(--text-tertiary)',
                        border: isActive
                          ? '1px solid rgba(0,212,255,0.15)'
                          : '1px solid transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model */}
            <div>
              <span className="text-sm block mb-2">TICK 模型</span>
              <select
                value={tick.modelId ?? ''}
                onChange={(e) => saveTick({ modelId: e.target.value || undefined })}
                disabled={tickSaving}
                className="w-full px-3 py-2 rounded-md text-xs"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-data)',
                }}
              >
                <option value="">跟随默认模型</option>
                {modelProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.modelName} ({p.provider})
                  </option>
                ))}
              </select>
              <p
                className="text-xs mt-1.5"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-data)' }}
              >
                选择轻量模型可大幅降低 TICK 的 token 成本。
              </p>
            </div>

            {tickSaving && (
              <p className="text-xs" style={{ color: 'var(--cyan)' }}>
                保存中...
              </p>
            )}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
