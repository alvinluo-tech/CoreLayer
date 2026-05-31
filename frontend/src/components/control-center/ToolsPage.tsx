import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, Shield, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { getToolCallLogs, type ToolCallLogEntry } from '@/lib/tauri';

type SourceFilter = 'all' | 'native' | 'mcp' | 'skill' | 'rest';

const riskColors: Record<string, string> = {
  low: 'bg-green-500/10 text-green-600',
  medium: 'bg-yellow-500/10 text-yellow-600',
  high: 'bg-orange-500/10 text-orange-600',
  critical: 'bg-red-500/10 text-red-600',
};

export function ToolsPage() {
  const { tools, fetchTools, isLoading } = useMCPStore();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [logs, setLogs] = useState<ToolCallLogEntry[]>([]);

  useEffect(() => {
    fetchTools();
    getToolCallLogs(20)
      .then((r) => setLogs(r.logs as ToolCallLogEntry[]))
      .catch(() => {});
  }, [fetchTools]);

  const filtered = tools.filter((t) => {
    const matchesSource = sourceFilter === 'all' || t.source === sourceFilter;
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesSource && matchesSearch;
  });

  const sourceButtons: { id: SourceFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'native', label: '原生' },
    { id: 'mcp', label: 'MCP' },
    { id: 'skill', label: '技能' },
    { id: 'rest', label: 'REST' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">工具管理</h2>
          <p className="text-sm text-muted-foreground">工具注册表和审计日志</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchTools();
            getToolCallLogs(20)
              .then((r) => setLogs(r.logs as ToolCallLogEntry[]))
              .catch(() => {});
          }}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工具..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border rounded-md"
            />
          </div>
          <div className="flex gap-1">
            {sourceButtons.map((btn) => (
              <Button
                key={btn.id}
                variant={sourceFilter === btn.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSourceFilter(btn.id)}
                className="text-xs"
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tool Table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">
            工具列表
            <span className="text-muted-foreground ml-2">({filtered.length})</span>
          </h3>
        </div>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium">
            <span>工具</span>
            <span>来源</span>
            <span>风险</span>
            <span>状态</span>
          </div>
          {/* Rows */}
          {filtered.map((tool) => (
            <div
              key={tool.id}
              className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-sm items-center"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{tool.title || tool.name}</p>
                <p className="text-xs text-muted-foreground truncate">{tool.name}</p>
              </div>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-fit">
                {tool.source}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded w-fit ${riskColors[tool.risk] ?? 'bg-muted text-muted-foreground'}`}
              >
                {tool.risk}
              </span>
              <span className="text-xs text-muted-foreground">
                {tool.requiresConfirmation ? '需确认' : '自动'}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">无匹配工具</p>
          )}
        </div>
      </Card>

      {/* Audit Logs */}
      <Card className="p-4">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4" />
          审计日志
        </h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">暂无日志</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[140px_1fr_60px_60px_80px] gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium">
              <span>时间</span>
              <span>工具</span>
              <span>结果</span>
              <span>风险</span>
              <span>耗时</span>
            </div>
            {logs.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[140px_1fr_60px_60px_80px] gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-xs items-center"
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(log.createdAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="truncate font-mono">{log.toolName}</span>
                <span>
                  {log.resultSuccess ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded ${riskColors[log.risk ?? 'low'] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {log.risk ?? '—'}
                </span>
                <span className="text-muted-foreground">
                  {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
