import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getToolCallLogs, type ToolCallLogEntry } from '@/lib/tauri';

const riskConfig: Record<
  string,
  { label: string; color: string; icon: typeof Shield; description: string }
> = {
  low: {
    label: '低',
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: CheckCircle2,
    description: '自动执行，无需确认',
  },
  medium: {
    label: '中',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    icon: AlertTriangle,
    description: '执行并通知',
  },
  high: {
    label: '高',
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    icon: AlertTriangle,
    description: '需要用户确认',
  },
  critical: {
    label: '极高',
    color: 'bg-red-500/10 text-red-600 border-red-500/20',
    icon: XCircle,
    description: '需要显式批准',
  },
};

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function PermissionPage() {
  const { tools, fetchTools, isLoading } = useMCPStore();
  const [deniedLogs, setDeniedLogs] = useState<ToolCallLogEntry[]>([]);
  const [expandedRisk, setExpandedRisk] = useState<RiskLevel | null>(null);

  useEffect(() => {
    fetchTools();
    getToolCallLogs(50)
      .then((r) => {
        const allLogs = r.logs as ToolCallLogEntry[];
        setDeniedLogs(allLogs.filter((l) => !l.resultSuccess));
      })
      .catch(() => {});
  }, [fetchTools]);

  const toolsByRisk: Record<RiskLevel, typeof tools> = {
    low: tools.filter((t) => t.risk === 'low'),
    medium: tools.filter((t) => t.risk === 'medium'),
    high: tools.filter((t) => t.risk === 'high'),
    critical: tools.filter((t) => t.risk === 'critical'),
  };

  const totalTools = tools.length;
  const confirmedTools = tools.filter((t) => t.requiresConfirmation).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">权限矩阵</h2>
          <p className="text-sm text-muted-foreground">工具风险等级与执行策略</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchTools();
            getToolCallLogs(50)
              .then((r) => {
                const allLogs = r.logs as ToolCallLogEntry[];
                setDeniedLogs(allLogs.filter((l) => !l.resultSuccess));
              })
              .catch(() => {});
          }}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map((risk) => {
          const config = riskConfig[risk]!;
          const Icon = config.icon;
          return (
            <Card key={risk} className={`p-4 border ${config.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{config.label}风险</span>
              </div>
              <p className="text-2xl font-bold">{toolsByRisk[risk].length}</p>
              <p className="text-xs opacity-70 mt-1">{config.description}</p>
            </Card>
          );
        })}
      </div>

      {/* Overview Stats */}
      <Card className="p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{totalTools}</p>
            <p className="text-xs text-muted-foreground">总工具数</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{confirmedTools}</p>
            <p className="text-xs text-muted-foreground">需确认工具</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{deniedLogs.length}</p>
            <p className="text-xs text-muted-foreground">失败调用</p>
          </div>
        </div>
      </Card>

      {/* Risk Level Breakdown */}
      <Card className="p-4">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4" />
          风险等级明细
        </h3>
        <div className="space-y-2">
          {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map((risk) => {
            const config = riskConfig[risk]!;
            const riskTools = toolsByRisk[risk];
            const isExpanded = expandedRisk === risk;
            const Icon = config.icon;

            return (
              <div key={risk} className="rounded-lg border overflow-hidden">
                <button
                  onClick={() => setExpandedRisk(isExpanded ? null : risk)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{config.label}风险</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
                      {riskTools.length} 工具
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isExpanded && riskTools.length > 0 && (
                  <div className="border-t">
                    <div className="grid grid-cols-[1fr_100px_80px] gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30">
                      <span>工具</span>
                      <span>来源</span>
                      <span>确认</span>
                    </div>
                    {riskTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="grid grid-cols-[1fr_100px_80px] gap-2 px-3 py-2 text-sm items-center hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{tool.title || tool.name}</p>
                          <p className="text-xs text-muted-foreground truncate font-mono">
                            {tool.name}
                          </p>
                        </div>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-fit">
                          {tool.source}
                        </span>
                        <span className="text-xs">
                          {tool.requiresConfirmation ? (
                            <span className="text-yellow-600">需确认</span>
                          ) : (
                            <span className="text-green-600">自动</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {isExpanded && riskTools.length === 0 && (
                  <div className="border-t p-4 text-center text-sm text-muted-foreground">
                    无此风险等级的工具
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent Failed Calls */}
      {deniedLogs.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <XCircle className="h-4 w-4 text-destructive" />
            失败的工具调用
          </h3>
          <div className="space-y-1">
            {deniedLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="font-mono">{log.toolName}</span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    riskConfig[log.risk as RiskLevel]?.color ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {log.risk ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
