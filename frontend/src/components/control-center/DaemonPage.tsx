import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import {
  Activity,
  RefreshCw,
  RotateCcw,
  Server,
  Clock,
  AlertCircle,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getDaemonStatus, getHealth, restartDaemon, type DaemonStatus } from '@/lib/tauri';

export function DaemonPage() {
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    status: string;
    timestamp: string;
    storageMode: string;
    aiProvider: string;
    aiModel: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [status, health] = await Promise.allSettled([getDaemonStatus(), getHealth()]);
      if (status.status === 'fulfilled') setDaemonStatus(status.value);
      if (health.status === 'fulfilled') setHealthInfo(health.value);
      if (status.status === 'rejected' && health.status === 'rejected') {
        setError('无法连接到守护进程');
      }
    } catch {
      setError('获取状态失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRestart = async () => {
    setIsRestarting(true);
    setError(null);
    try {
      const result = await restartDaemon();
      setDaemonStatus(result);
      setTimeout(fetchAll, 2000);
    } catch {
      setError('重启失败');
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">守护进程</h2>
          <p className="text-sm text-muted-foreground">Daemon 进程健康监控</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            disabled={isRestarting}
            className="gap-1.5"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
            重启
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Main Status Card */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-medium">进程状态</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              {daemonStatus?.running ? (
                <Wifi className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className="text-xs text-muted-foreground">运行状态</span>
            </div>
            <StatusBadge
              status={daemonStatus?.running ? 'healthy' : 'error'}
              label={daemonStatus?.running ? '运行中' : '已停止'}
            />
          </div>
          <div className="p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              {daemonStatus?.healthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
              )}
              <span className="text-xs text-muted-foreground">健康状态</span>
            </div>
            <StatusBadge
              status={daemonStatus?.healthy ? 'healthy' : 'warning'}
              label={daemonStatus?.healthy ? '健康' : '异常'}
            />
          </div>
          <div className="p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">重启次数</span>
            </div>
            <p className="text-lg font-bold">{daemonStatus?.restartAttempts ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">上次检查</span>
            </div>
            <p className="text-xs font-mono">
              {daemonStatus?.lastHealthCheck
                ? new Date(daemonStatus.lastHealthCheck).toLocaleString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </p>
          </div>
        </div>
      </Card>

      {/* Runtime Info */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Server className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">运行时信息</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <span className="text-sm">运行模式</span>
            <span className="text-sm font-mono">{daemonStatus?.runtimeMode ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <span className="text-sm">PID</span>
            <span className="text-sm font-mono">{daemonStatus?.pid ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <span className="text-sm">端口</span>
            <span className="text-sm font-mono">{daemonStatus?.port ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <span className="text-sm">日志路径</span>
            <span
              className="text-xs font-mono truncate max-w-48"
              title={daemonStatus?.logPath ?? ''}
            >
              {daemonStatus?.logPath ?? '—'}
            </span>
          </div>
        </div>
      </Card>

      {/* Connection Info */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Server className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">连接信息</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <span className="text-sm">Daemon URL</span>
            <span className="text-sm font-mono text-muted-foreground">
              {daemonStatus?.url ?? '—'}
            </span>
          </div>
          {healthInfo && (
            <>
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                <span className="text-sm">API 状态</span>
                <StatusBadge
                  status={healthInfo.status === 'ok' ? 'healthy' : 'error'}
                  label={healthInfo.status}
                />
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                <span className="text-sm">存储模式</span>
                <span className="text-sm font-mono">{healthInfo.storageMode}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                <span className="text-sm">AI 提供商</span>
                <span className="text-sm font-mono">{healthInfo.aiProvider}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
                <span className="text-sm">AI 模型</span>
                <span className="text-sm font-mono">{healthInfo.aiModel}</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Error Info */}
      {daemonStatus?.lastError && (
        <Card className="p-5 border-destructive/30">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <h3 className="text-sm font-medium text-destructive">最近错误</h3>
          </div>
          <p className="text-sm font-mono text-destructive/80 bg-destructive/5 p-3 rounded-md">
            {daemonStatus.lastError}
          </p>
        </Card>
      )}
    </div>
  );
}
