import { useEffect, useState } from "react";
import { useMCPStore } from "@/stores/mcpStore";
import {
  Plug,
  PlugZap,
  Unplug,
  Wrench,
  Brain,
  Server,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface MCPSettingsProps {
  className?: string;
}

export function MCPSettings({ className }: MCPSettingsProps) {
  const {
    servers,
    tools: _tools,
    toolCounts,
    modelProfiles,
    isLoading,
    error,
    fetchServers,
    fetchTools,
    fetchModelProfiles,
    connectServer,
    disconnectServer,
  } = useMCPStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState({
    id: "",
    name: "",
    transport: "http" as "http" | "stdio" | "sse",
    url: "",
  });

  useEffect(() => {
    fetchServers();
    fetchTools();
    fetchModelProfiles();
  }, [fetchServers, fetchTools, fetchModelProfiles]);

  const handleConnect = async () => {
    if (!newServer.id || !newServer.name) return;
    await connectServer(newServer);
    setNewServer({ id: "", name: "", transport: "http", url: "" });
    setShowAddForm(false);
  };

  const handleDisconnect = async (serverId: string) => {
    await disconnectServer(serverId);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "connecting":
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case "error":
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
            <p className="text-sm text-muted-foreground">
              管理 MCP 服务器连接和工具
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                fetchServers();
                fetchTools();
                fetchModelProfiles();
              }}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
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

        {/* Add Server Form */}
        {showAddForm && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
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
                      transport: e.target.value as "http" | "stdio" | "sse",
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
                onClick={() => setShowAddForm(false)}
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
                连接
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
                          server.status === "connected"
                            ? "bg-green-500/10 text-green-600"
                            : server.status === "error"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {server.status}
                      </span>
                    </div>
                    {server.config.url && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {server.config.url}
                      </p>
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
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(server.config.id)}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="断开连接"
                >
                  <Unplug className="h-4 w-4" />
                </button>
              </div>
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
