import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import type { MCPServerInfo, MCPAuthConfig } from '@/lib/tauri';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import {
  PlugZap,
  Unplug,
  Wrench,
  RefreshCw,
  Plus,
  Pencil,
  Server,
  AlertCircle,
  Loader2,
  Key,
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
    updateServer,
  } = useMCPStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newServer, setNewServer] = useState({
    id: '',
    name: '',
    transport: 'http' as 'http' | 'stdio' | 'sse',
    url: '',
    authType: 'none' as 'none' | 'bearer',
    authToken: '',
  });

  useEffect(() => {
    fetchServers();
    fetchTools();
  }, [fetchServers, fetchTools]);

  const handleConnect = async () => {
    if (!newServer.id || !newServer.name) return;
    setFormError(null);

    const auth: MCPAuthConfig | undefined =
      newServer.authType === 'bearer' && newServer.authToken
        ? { type: 'bearer', tokenRef: newServer.authToken }
        : newServer.authType === 'none'
          ? { type: 'none' }
          : undefined;

    try {
      if (editingId) {
        await updateServer(editingId, {
          name: newServer.name,
          transport: newServer.transport,
          url: newServer.url,
          auth,
        });
      } else {
        await connectServer({ ...newServer, auth });
      }
      setNewServer({
        id: '',
        name: '',
        transport: 'http',
        url: '',
        authType: 'none',
        authToken: '',
      });
      setShowAddForm(false);
      setEditingId(null);
    } catch (e) {
      setFormError(String(e));
    }
  };

  const handleEdit = (server: MCPServerInfo) => {
    setEditingId(server.config.id);
    setNewServer({
      id: server.config.id,
      name: server.config.name,
      transport: (server.config.transport as 'http' | 'stdio' | 'sse') ?? 'http',
      url: server.config.url ?? '',
      authType: server.config.auth?.type === 'bearer' ? 'bearer' : 'none',
      authToken: server.config.auth?.type === 'bearer' ? (server.config.auth.tokenRef ?? '') : '',
    });
    setShowAddForm(true);
    setFormError(null);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormError(null);
    setNewServer({ id: '', name: '', transport: 'http', url: '', authType: 'none', authToken: '' });
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
          <Button
            size="sm"
            onClick={() => {
              if (showAddForm && !editingId) {
                setShowAddForm(false);
              } else {
                setEditingId(null);
                setFormError(null);
                setNewServer({
                  id: '',
                  name: '',
                  transport: 'http',
                  url: '',
                  authType: 'none',
                  authToken: '',
                });
                setShowAddForm(true);
              }
            }}
            className="gap-1.5"
          >
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

      {/* Add / Edit Server Form */}
      {showAddForm && (
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-medium">{editingId ? '编辑服务器' : '添加 MCP 服务器'}</h4>
          {formError && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{formError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">ID</label>
              <input
                type="text"
                value={newServer.id}
                onChange={(e) => setNewServer({ ...newServer, id: e.target.value })}
                placeholder="my-server"
                disabled={!!editingId}
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div>
              <label className="text-xs text-muted-foreground">认证方式</label>
              <select
                value={newServer.authType}
                onChange={(e) =>
                  setNewServer({
                    ...newServer,
                    authType: e.target.value as 'none' | 'bearer',
                    authToken: e.target.value === 'none' ? '' : newServer.authToken,
                  })
                }
                className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
              >
                <option value="none">无认证</option>
                <option value="bearer">Bearer Token</option>
              </select>
            </div>
            {newServer.authType === 'bearer' && (
              <div>
                <label className="text-xs text-muted-foreground">Token</label>
                <input
                  type="password"
                  value={newServer.authToken}
                  onChange={(e) => setNewServer({ ...newServer, authToken: e.target.value })}
                  placeholder="输入 Bearer Token"
                  className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelForm}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!newServer.id || !newServer.name || isLoading}
              className="gap-1.5"
            >
              <PlugZap className="h-3.5 w-3.5" />
              {editingId ? '保存' : '连接'}
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
                  {server.config.auth && server.config.auth.type !== 'none' && (
                    <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                      <Key className="h-3 w-3" />
                      {server.config.auth.type === 'bearer'
                        ? 'Bearer Token'
                        : server.config.auth.type}{' '}
                      认证已配置
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
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(server)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="编辑"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
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
