import { useEffect, useState } from 'react';
import { useMCPStore } from '@/stores/mcpStore';
import { useModelStore } from '@/stores/modelStore';
import type { MCPServerInfo } from '@/lib/tauri';
import {
  Plug,
  PlugZap,
  Unplug,
  Wrench,
  Brain,
  Server,
  Plus,
  Pencil,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface MCPSettingsProps {
  className?: string;
}

export function MCPSettings({ className }: MCPSettingsProps) {
  const {
    servers,
    tools: _tools,
    toolCounts,
    isLoading,
    error,
    fetchServers,
    fetchTools,
    connectServer,
    disconnectServer,
    updateServer,
  } = useMCPStore();
  const { modelProfiles, fetchAll: fetchModels } = useModelStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [newServer, setNewServer] = useState({
    id: '',
    name: '',
    transport: 'http' as 'http' | 'stdio' | 'sse',
    url: '',
  });

  useEffect(() => {
    fetchServers();
    fetchTools();
    fetchModels();
  }, [fetchServers, fetchTools, fetchModels]);

  const handleConnect = async () => {
    if (!newServer.id || !newServer.name) return;
    setFormError(null);
    try {
      if (editingId) {
        await updateServer(editingId, {
          name: newServer.name,
          transport: newServer.transport,
          url: newServer.url,
        });
      } else {
        await connectServer(newServer);
      }
      setNewServer({ id: '', name: '', transport: 'http', url: '' });
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
    });
    setShowAddForm(true);
    setFormError(null);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormError(null);
    setNewServer({ id: '', name: '', transport: 'http', url: '' });
  };

  const handleDisconnect = async (serverId: string) => {
    await disconnectServer(serverId);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Unplug className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Plug className="h-5 w-5" />
              MCP 服务器
            </h3>
            <p className="text-sm text-muted-foreground">管理 MCP 服务器连接和工具</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                fetchServers();
                fetchTools();
                fetchModels();
              }}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                if (showAddForm && !editingId) {
                  setShowAddForm(false);
                } else {
                  setEditingId(null);
                  setFormError(null);
                  setNewServer({ id: '', name: '', transport: 'http', url: '' });
                  setShowAddForm(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              添加服务器
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Add / Edit Server Form */}
        {showAddForm && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
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
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelForm}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConnect}
                disabled={!newServer.id || !newServer.name || isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <PlugZap className="h-4 w-4" />
                {editingId ? '保存' : '连接'}
              </button>
            </div>
          </div>
        )}

        {/* Server List */}
        <div className="space-y-3">
          {servers.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无 MCP 服务器连接</p>
              <p className="text-xs mt-1">点击"添加服务器"开始连接</p>
            </div>
          )}

          {servers.map((server) => (
            <div
              key={server.config.id}
              className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {statusIcon(server.status)}
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
                      <p className="text-xs text-muted-foreground mt-1">{server.config.url}</p>
                    )}
                    {server.lastError && (
                      <p className="text-xs text-red-500 mt-1">{server.lastError}</p>
                    )}
                    {/* Tool/Resource/Prompt counts */}
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

                    {server.status === 'connected' && server.tools.length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedServerId(
                            expandedServerId === server.config.id ? null : server.config.id
                          )
                        }
                        className="flex items-center gap-1 mt-3 text-xs text-primary hover:underline transition-all"
                      >
                        {expandedServerId === server.config.id ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            收起工具详情
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            查看工具列表 ({server.tools.length})
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(server)}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDisconnect(server.config.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="断开连接"
                  >
                    <Unplug className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {expandedServerId === server.config.id && server.status === 'connected' && (
                <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
                  <h5 className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Wrench className="h-3 w-3 text-primary" /> 注册的工具详情:
                  </h5>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {(() => {
                      const serverTools = _tools.filter(
                        (t) => t.source === 'mcp' && t.appId === server.config.id
                      );
                      if (serverTools.length === 0) {
                        return (
                          <div className="text-xs text-muted-foreground italic pl-2">
                            正在加载或未找到详细工具定义，基础列表：
                            <ul className="list-disc pl-4 mt-1.5 not-italic space-y-1">
                              {server.tools.map((t) => (
                                <li key={t.name}>
                                  <span className="font-mono font-semibold text-foreground">
                                    {t.name}
                                  </span>
                                  {t.description && (
                                    <span className="text-muted-foreground">
                                      {' '}
                                      - {t.description}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      }
                      return serverTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="p-2.5 rounded bg-muted/40 border border-border/60 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-foreground">
                              {tool.name}
                            </span>
                            <div className="flex gap-1">
                              {tool.requiresConfirmation && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/10">
                                  需确认
                                </span>
                              )}
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                                  tool.risk === 'low'
                                    ? 'bg-green-500/10 text-green-600 border-green-500/10'
                                    : tool.risk === 'medium'
                                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/10'
                                      : 'bg-red-500/10 text-red-600 border-red-500/10'
                                }`}
                              >
                                风险: {tool.risk}
                              </span>
                            </div>
                          </div>
                          {tool.description && (
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                              {tool.description}
                            </p>
                          )}
                          {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                            <div className="bg-muted/75 p-2 rounded border border-border/30 mt-1 font-mono text-[10px] max-h-32 overflow-y-auto text-muted-foreground leading-relaxed">
                              <span className="text-foreground/75 font-semibold block mb-1">
                                参数 Schema:
                              </span>
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(tool.inputSchema, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tool Registry Summary */}
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Wrench className="h-4 w-4" />
            工具注册表
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{toolCounts.native}</p>
              <p className="text-xs text-muted-foreground">原生工具</p>
            </div>
            <div className="p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{toolCounts.mcp}</p>
              <p className="text-xs text-muted-foreground">MCP 工具</p>
            </div>
            <div className="p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{toolCounts.skill}</p>
              <p className="text-xs text-muted-foreground">技能工具</p>
            </div>
            <div className="p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{toolCounts.rest}</p>
              <p className="text-xs text-muted-foreground">REST 工具</p>
            </div>
          </div>
        </div>

        {/* Model Profiles */}
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4" />
            模型配置
          </h3>
          <div className="space-y-2">
            {modelProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <p className="text-sm font-medium">{profile.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.provider} / {profile.modelName}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {profile.capabilities.toolCalling && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                      工具
                    </span>
                  )}
                  {profile.capabilities.vision && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">
                      视觉
                    </span>
                  )}
                  {profile.capabilities.longContext && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                      长上下文
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
