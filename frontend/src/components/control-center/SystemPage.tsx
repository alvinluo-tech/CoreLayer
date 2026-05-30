import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import {
  Server,
  RefreshCw,
  Loader2,
  Clock,
  AlertTriangle,
  RotateCw,
} from "lucide-react";
import { getDaemonStatus, getHealth, restartDaemon, type DaemonStatus } from "@/lib/tauri";

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

  const fetchData = async () => {
    const [d, h] = await Promise.allSettled([getDaemonStatus(), getHealth()]);
    if (d.status === "fulfilled") setDaemon(d.value);
    if (h.status === "fulfilled") setHealth(h.value);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    setRestartError(null);
    try {
      const result = await restartDaemon();
      setDaemon(result);
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("重启守护进程失败:", err);
      setRestartError(message);
      await fetchData();
    } finally {
      setRestarting(false);
    }
  };

  const daemonStatus = daemon?.healthy
    ? ("healthy" as const)
    : daemon?.running
      ? ("warning" as const)
      : ("error" as const);

  const daemonLabel = daemon?.healthy
    ? "运行中"
    : daemon?.running
      ? "异常"
      : "未运行";

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
            <p className="font-mono text-xs mt-0.5">{daemon?.url ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">重启次数</p>
            <p className="mt-0.5">
              {daemon?.restartAttempts ?? 0} / 3
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">最后健康检查</p>
            <p className="mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {daemon?.lastHealthCheck
                ? !isNaN(Number(daemon.lastHealthCheck))
                  ? new Date(Number(daemon.lastHealthCheck)).toLocaleString("zh-CN")
                  : new Date(daemon.lastHealthCheck).toString() !== "Invalid Date"
                    ? new Date(daemon.lastHealthCheck).toLocaleString("zh-CN")
                    : daemon.lastHealthCheck
                : "—"}
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
                "无"
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
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="gap-1.5"
          >
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
              name: "Daemon",
              ok: daemon?.healthy ?? false,
            },
            {
              name: "数据库",
              ok: health?.status === "ok",
            },
            {
              name: "AI Provider",
              ok: !!health?.aiProvider,
            },
          ].map((check) => (
            <div
              key={check.name}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
            >
              <span className="text-sm">{check.name}</span>
              <StatusBadge
                status={check.ok ? "healthy" : "error"}
                label={check.ok ? "正常" : "异常"}
              />
            </div>
          ))}
        </div>
        {health?.timestamp && (
          <p className="text-xs text-muted-foreground mt-3">
            检查时间: {new Date(health.timestamp).toLocaleString("zh-CN")}
          </p>
        )}
      </Card>
    </div>
  );
}
