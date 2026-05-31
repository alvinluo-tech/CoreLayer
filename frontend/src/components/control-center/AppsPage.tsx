import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import {
  PlugZap,
  Unplug,
  Wrench,
  RefreshCw,
  Plus,
  Server,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export function AppsPage() {
  const {
    servers,
    toolCounts,
    isLoading,
    error,
    fetchServers,
    fetchTools,
    connectServer,
    disconnectServer,
  } = useMCPStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState({
    id: '',
    name: '',
    transport: 'http' as 'http' | 'stdio' | 'sse',
    url: '',
  });

  useEffect(() => {
    fetchServers();
    fetchTools();
  }, [fetchServers, fetchTools]);

  const handleConnect = async () => {
    if (!newServer.id || !newServer.name) return;
    await connectServer(newServer);
    setNewServer({ id: '', name: '', transport: 'http', url: '' });
    setShowAddForm(false);
  };

  const totalTools = toolCounts.native + toolCounts.mcp + toolCounts.skill + toolCounts.rest;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">应用 & MCP</h2>
          <p className="text-sm text-muted-foreground">管理 MCP 服务器连接</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchServers();
              fetchTools();
            }}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            添加服务器
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Add Server Form */}
      {showAddForm && (
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-medium">添加 MCP 服务器</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">ID</label>
              <input
                type="text"
                value={newServer.id}
                onChange={(e) => setNewServer({ ...newServer, id: e.target.value })}
                placeholder="my-server"
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">名称</label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="My MCP Server"
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">传输方式</label>
              <select
                value={newServer.transport}
                onChange={(e) =>
                  setNewServer({
                    ...newServer,
                    transport: e.target.value as 'http' | 'stdio' | 'sse',
                  })
                }
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
              >
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
                <option value="stdio">stdio</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">URL</label>
              <input
                type="text"
                value={newServer.url}
                onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                placeholder="http://localhost:3000/mcp"
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!newServer.id || !newServer.name || isLoading}
              className="gap-1.5"
            >
              <PlugZap className="h-3.5 w-3.5" />
              连接
            </Button>
          </div>
        </Card>
      )}

      {/* Server List */}
      <div className="space-y-3">
        {servers.length === 0 && !isLoading && (
          <Card className="p-8 text-center">
            <Server className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">暂无 MCP 服务器连接</p>
            <p className="text-xs text-muted-foreground mt-1">点击"添加服务器"开始连接</p>
          </Card>
        )}

        {servers.map((server) => (
          <Card key={server.config.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {server.status === 'connecting' ? (
                  <Loader2 className="h-4 w-4 text-yellow-500 animate-spin mt-0.5" />
                ) : (
                  <StatusBadge
                    status={
                      server.status === 'connected'
                        ? 'healthy'
                        : server.status === 'error'
                          ? 'error'
                          : 'idle'
                    }
                    label=""
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{server.config.name}</h4>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {server.config.transport}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        server.status === 'connected'
                          ? 'bg-green-500/10 text-green-600'
                          : server.status === 'error'
                            ? 'bg-red-500/10 text-red-600'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {server.status}
                    </span>
                  </div>
                  {server.config.url && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      {server.config.url}
                    </p>
                  )}
                  {server.lastError && (
                    <p className="text-xs text-red-500 mt-1">{server.lastError}</p>
                  )}
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {server.tools.length} 工具
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {server.resources.length} 资源
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {server.prompts.length} 提示词
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => disconnectServer(server.config.id)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="断开连接"
              >
                <Unplug className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Tool Registry Summary */}
      <Card className="p-5">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4" />
          工具注册表
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '原生工具', count: toolCounts.native },
            { label: 'MCP 工具', count: toolCounts.mcp },
            { label: '技能工具', count: toolCounts.skill },
            { label: 'REST 工具', count: toolCounts.rest },
          ].map((item) => (
            <div key={item.label} className="p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">共 {totalTools} 个已注册工具</p>
      </Card>
    </div>
  );
}
