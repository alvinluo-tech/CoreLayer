import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  RefreshCw,
  Star,
  X,
  Search,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useModelStore, type ProviderEntry } from "@/stores/modelStore";
import type { RoutingRule, ProviderPreset } from "@/lib/tauri";

const taskTypeLabels: Record<string, string> = {
  chat: "默认聊天",
  fast: "快速响应",
  reasoning: "深度推理",
  toolAgent: "工具调用",
  coding: "代码生成",
  voice: "语音对话",
  private: "隐私模式",
};

export function ModelsPage() {
  const {
    providers,
    providerPresets,
    routingRules,
    routingRulesCustom,
    activeModelId,
    modelProfiles,
    isLoading,
    error,
    fetchAll,
  } = useModelStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">模型广场</h2>
          <p className="text-sm text-muted-foreground">管理 AI 提供商、模型和路由规则</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Section 1: Provider Gallery */}
      <ProviderGallery
        providers={providers}
        presets={providerPresets}
        isLoading={isLoading}
      />

      {/* Section 2: Model Marketplace */}
      <ModelMarketplace
        providers={providers}
        profiles={modelProfiles}
        activeModelId={activeModelId}
        isLoading={isLoading}
      />

      {/* Section 3: Active Config */}
      <ActiveConfigSection
        activeModelId={activeModelId}
        profiles={modelProfiles}
        rules={routingRules}
        isCustom={routingRulesCustom}
        isLoading={isLoading}
      />
    </div>
  );
}

// ---- Section 1: Provider Gallery ----

function ProviderGallery({
  providers,
  presets,
  isLoading,
}: {
  providers: ProviderEntry[];
  presets: ProviderPreset[];
  isLoading: boolean;
}) {
  const { addProvider, addCustomProvider, updateProvider, removeProvider, discoverModels, testProvider } = useModelStore();
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getProviderBrandStyle = (id: string, enabled: boolean) => {
    if (!enabled) {
      return "border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:border-border/80";
    }
    switch (id) {
      case "openai":
        return "border-emerald-500/30 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06] hover:border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.02)]";
      case "deepseek":
        return "border-blue-500/30 bg-blue-500/[0.03] hover:bg-blue-500/[0.06] hover:border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.02)]";
      case "anthropic":
        return "border-orange-500/30 bg-orange-500/[0.03] hover:bg-orange-500/[0.06] hover:border-orange-500/50 shadow-[0_0_12px_rgba(249,115,22,0.02)]";
      case "google":
        return "border-purple-500/30 bg-purple-500/[0.03] hover:bg-purple-500/[0.06] hover:border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.02)]";
      case "ollama":
        return "border-neutral-500/40 bg-neutral-500/[0.04] hover:bg-neutral-500/[0.08] hover:border-neutral-500/60 shadow-[0_0_12px_rgba(115,115,115,0.02)] dark:border-neutral-400/30 dark:bg-neutral-400/[0.03] dark:hover:bg-neutral-400/[0.06]";
      case "groq":
        return "border-amber-500/30 bg-amber-500/[0.03] hover:bg-amber-500/[0.06] hover:border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.02)]";
      default:
        return "border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.05] hover:border-primary/40";
    }
  };
  const [editKey, setEditKey] = useState("");
  const [editURL, setEditURL] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, { id: string; name: string }[]>>({});
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<ProviderPreset | "custom" | null>(null);
  const [formBaseURL, setFormBaseURL] = useState("");
  const [formAPIKey, setFormAPIKey] = useState("");
  const [formCustomId, setFormCustomId] = useState("");
  const [formCustomName, setFormCustomName] = useState("");
  const [showFormKey, setShowFormKey] = useState(false);
  const [showEditKey, setShowEditKey] = useState(false);

  const connectedIds = new Set(providers.map((p) => p.id));
  const unconnectedPresets = presets.filter((p) => !connectedIds.has(p.id));

  const handleSelectPreset = (preset: ProviderPreset) => {
    setActivePreset(preset);
    setFormBaseURL(preset.defaultBaseURL);
    setFormAPIKey("");
    setFormCustomId("");
    setFormCustomName("");
  };

  const handleSelectCustom = () => {
    setActivePreset("custom");
    setFormBaseURL("");
    setFormAPIKey("");
    setFormCustomId("");
    setFormCustomName("");
  };

  // Pre-select first unconnected preset on open
  useEffect(() => {
    if (showAdd) {
      if (unconnectedPresets.length > 0 && unconnectedPresets[0]) {
        handleSelectPreset(unconnectedPresets[0]);
      } else {
        handleSelectCustom();
      }
    } else {
      setActivePreset(null);
    }
  }, [showAdd, unconnectedPresets.length]);

  const handleSubmitForm = async () => {
    if (!activePreset) return;
    if (activePreset === "custom") {
      if (!formCustomId || !formCustomName || !formBaseURL) return;
      await addCustomProvider({
        id: formCustomId,
        name: formCustomName,
        baseURL: formBaseURL,
        apiKey: formAPIKey || undefined,
      });
    } else {
      await addProvider(activePreset.id, formAPIKey || undefined);
    }
    setShowAdd(false);
    setActivePreset(null);
  };

  const handleSaveEdit = async (id: string) => {
    const updates: { apiKey?: string; baseURL?: string } = {};
    if (editKey) updates.apiKey = editKey;
    if (editURL) updates.baseURL = editURL;
    if (Object.keys(updates).length > 0) {
      await updateProvider(id, updates);
    }
    setExpandedId(null);
    setEditKey("");
    setEditURL("");
  };

  const handleDiscover = async (id: string) => {
    setDiscovering(id);
    const models = await discoverModels(id);
    setDiscoveredModels((prev) => ({ ...prev, [id]: models }));
    setDiscovering(null);
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    const res = await testProvider(id);
    setTestResults((prev) => ({ ...prev, [id]: res }));
    setTestingId(null);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">AI 提供商</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          添加提供商
        </Button>
      </div>

      {/* Add Provider Panel */}
      {showAdd && (
        <div className="p-5 rounded-xl border border-border/80 bg-muted/30 shadow-sm space-y-5 mb-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b pb-3 border-border/60">
            <div>
              <h4 className="text-sm font-bold text-foreground">添加 AI 提供商</h4>
              <p className="text-xs text-muted-foreground">选择内置的官方预设渠道，或接入兼容 OpenAI 的自定义服务商。</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowAdd(false)} className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left side: Channels list (5 columns) */}
            <div className="md:col-span-5 space-y-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">1. 选择服务渠道</span>
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {/* Unconnected Preset Cards */}
                {unconnectedPresets.map((preset) => {
                  const isSelected = activePreset && typeof activePreset === "object" && activePreset.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.02] cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/[0.03] font-semibold"
                          : "border-border/60 bg-background/50 hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        preset.id === "openai" ? "bg-emerald-500/10 text-emerald-600" :
                        preset.id === "deepseek" ? "bg-blue-500/10 text-blue-600" :
                        preset.id === "anthropic" ? "bg-orange-500/10 text-orange-600" :
                        preset.id === "google" ? "bg-purple-500/10 text-purple-600" :
                        preset.id === "ollama" ? "bg-neutral-500/10 text-neutral-600 dark:bg-neutral-400/10 dark:text-neutral-400" :
                        preset.id === "groq" ? "bg-amber-500/10 text-amber-600" :
                        "bg-primary/10 text-primary"
                      }`}>
                        {preset.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs truncate font-medium">{preset.nameCN}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{preset.popularModels.length}个预设模型</p>
                      </div>
                    </button>
                  );
                })}

                {/* Custom Card */}
                <button
                  onClick={() => handleSelectCustom()}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.02] cursor-pointer ${
                    activePreset === "custom"
                      ? "border-primary bg-primary/[0.03] font-semibold"
                      : "border-border/60 bg-background/50 hover:border-primary/40"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    +
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs truncate font-medium">自定义渠道</p>
                    <p className="text-[10px] text-muted-foreground truncate">OpenAI 兼容协议</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Right side: Form (7 columns) */}
            <div className="md:col-span-7 bg-background/40 border rounded-xl p-4 space-y-4">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">2. 配置连接凭证</span>
              
              {activePreset ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2.5 text-xs text-muted-foreground">
                    <div className="mt-0.5 font-bold text-primary">💡</div>
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground block">
                        {activePreset === "custom" ? "自定义 Open compatible 提供商" : `连接 ${activePreset.nameCN}`}
                      </span>
                      <span>
                        {activePreset === "custom" 
                          ? "支持对接 OneAPI, FastGPT, LM Studio 或任何标准的第三方大模型转发代理端。" 
                          : activePreset.id === "ollama"
                          ? "本地推理引擎。请确保您的本地 Ollama 服务已启动，且默认端口 11434 可正常访问。"
                          : `请输入您的 ${activePreset.name} 账户凭据，Jarvis 将自动为您加载预设的流式服务与工具包。`
                        }
                      </span>
                    </div>
                  </div>

                  {activePreset === "custom" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">唯一 ID (英文标识)</label>
                        <input
                          type="text"
                          value={formCustomId}
                          onChange={(e) => setFormCustomId(e.target.value)}
                          placeholder="e.g. fast-gpt"
                          className="w-full px-2.5 py-1.5 text-xs bg-background border rounded-md font-mono focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">显示名称</label>
                        <input
                          type="text"
                          value={formCustomName}
                          onChange={(e) => setFormCustomName(e.target.value)}
                          placeholder="e.g. 我的私有大模型"
                          className="w-full px-2.5 py-1.5 text-xs bg-background border rounded-md focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Base URL */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Base URL (接口根地址)</label>
                      <input
                        type="text"
                        value={formBaseURL}
                        onChange={(e) => setFormBaseURL(e.target.value)}
                        disabled={activePreset !== "custom"}
                        placeholder="https://..."
                        className="w-full px-2.5 py-1.5 text-xs bg-background border rounded-md font-mono disabled:opacity-75 disabled:bg-muted/30 focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* API Key */}
                    {(activePreset === "custom" || (activePreset && typeof activePreset === "object" && activePreset.requiresApiKey)) && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-between">
                          <span>API Key (密钥)</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showFormKey ? "text" : "password"}
                            value={formAPIKey}
                            onChange={(e) => setFormAPIKey(e.target.value)}
                            placeholder={activePreset === "custom" ? "sk-..." : `输入您的 ${activePreset.name} API Key`}
                            className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-background border rounded-md focus:outline-none focus:border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowFormKey(!showFormKey)}
                            className="absolute right-2 top-1.5 p-0.5 rounded hover:bg-muted text-muted-foreground"
                          >
                            {showFormKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions & Explanations */}
                  <div className="pt-3 border-t border-border/60 flex justify-between gap-3 items-center">
                    <p className="text-[10px] text-muted-foreground">
                      连接后，即可在提供商列表中测试连接延迟与发现模型。
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                        取消
                      </Button>
                      <Button
                        size="sm"
                        disabled={isLoading || (activePreset === "custom" ? (!formCustomId || !formCustomName || !formBaseURL) : (activePreset.requiresApiKey && !formAPIKey))}
                        onClick={handleSubmitForm}
                        className="h-8 text-xs bg-primary text-primary-foreground font-semibold"
                      >
                        {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        立即连接渠道
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground space-y-1.5">
                  <span className="text-2xl">👈</span>
                  <p className="text-xs">请在左侧选择需要配置的服务提供商或自定义渠道</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Provider Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`p-3.5 rounded-xl border transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.99] backdrop-blur-sm ${getProviderBrandStyle(
              provider.id,
              provider.enabled
            )}`}
            onClick={() => {
              if (expandedId === provider.id) {
                setExpandedId(null);
              } else {
                setExpandedId(provider.id);
                setEditKey("");
                setEditURL(provider.baseURL);
              }
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold truncate">{provider.name}</span>
              {provider.enabled ? (
                <Wifi
                  className={`h-3.5 w-3.5 shrink-0 ${
                    provider.id === "openai"
                      ? "text-emerald-500"
                      : provider.id === "deepseek"
                      ? "text-blue-500"
                      : provider.id === "anthropic"
                      ? "text-orange-500"
                      : provider.id === "google"
                      ? "text-purple-500"
                      : provider.id === "ollama"
                      ? "text-neutral-500 dark:text-neutral-400"
                      : provider.id === "groq"
                      ? "text-amber-500"
                      : "text-primary"
                  }`}
                />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {provider.modelCount > 0 ? `${provider.modelCount} 模型` : "未配置模型"}
            </p>
            {expandedId === provider.id && (
              <div className="mt-3.5 pt-3.5 border-t border-border/60 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">API Key</label>
                  <div className="relative mt-0.5">
                    <input
                      type={showEditKey ? "text" : "password"}
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      placeholder={provider.apiKey ? "已配置 (留空保持不变)" : "输入 API Key"}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-background border rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditKey(!showEditKey)}
                      className="absolute right-2 top-1.5 p-0.5 rounded hover:bg-muted text-muted-foreground"
                    >
                      {showEditKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Base URL</label>
                  <input
                    type="text"
                    value={editURL}
                    onChange={(e) => setEditURL(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-background border rounded-md font-mono"
                  />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => handleSaveEdit(provider.id)} disabled={isLoading} className="flex-1 text-xs">
                    保存
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(provider.id)}
                    disabled={testingId === provider.id}
                    className="flex-1 text-xs gap-1"
                  >
                    {testingId === provider.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Activity className="h-3 w-3" />
                    )}
                    测试连接
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDiscover(provider.id)}
                    disabled={discovering === provider.id}
                    className="flex-1 text-xs gap-1"
                  >
                    {discovering === provider.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    发现模型
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProvider(provider.id)}
                    className="text-xs text-destructive hover:text-destructive px-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Connection Test Result */}
                {(() => {
                  const result = testResults[provider.id];
                  if (!result) return null;
                  return (
                    <div className={`p-2 rounded-md border text-xs flex items-center gap-1.5 mt-2 ${
                      result.success
                        ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
                        : "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400"
                    }`}>
                      {result.success ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          <span>连接正常 (延迟: {result.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          <span className="truncate flex-1" title={result.error}>
                            连接失败: {result.error}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })()}
                {/* Discovered Models */}
                {(() => {
                  const models = discoveredModels[provider.id];
                  if (!models) return null;
                  return (
                    <div className="mt-2 p-2 rounded bg-background border max-h-32 overflow-y-auto">
                      <p className="text-xs text-muted-foreground mb-1">
                        发现 {models.length} 个模型:
                      </p>
                      <div className="space-y-0.5">
                        {models.slice(0, 20).map((m) => (
                          <p key={m.id} className="text-xs font-mono truncate">{m.id}</p>
                        ))}
                        {models.length > 20 && (
                          <p className="text-xs text-muted-foreground">
                            ...还有 {models.length - 20} 个
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}



// ---- Section 2: Model Marketplace ----

function ModelMarketplace({
  providers,
  profiles,
  activeModelId,
  isLoading,
}: {
  providers: ProviderEntry[];
  profiles: { id: string; provider: string; modelName: string; displayName: string; capabilities: { toolCalling: boolean; vision: boolean; longContext: boolean; streaming: boolean }; limits: { contextWindow: number } }[];
  activeModelId: string | null;
  isLoading: boolean;
}) {
  const { deleteProfile, setActiveModel, upsertProfile } = useModelStore();
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newModel, setNewModel] = useState({ provider: "", modelName: "", displayName: "" });

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      !search ||
      p.displayName.toLowerCase().includes(search.toLowerCase()) ||
      p.modelName.toLowerCase().includes(search.toLowerCase());
    const matchesProvider = filterProvider === "all" || p.provider === filterProvider;
    return matchesSearch && matchesProvider;
  });

  const handleAddModel = async () => {
    if (!newModel.provider || !newModel.modelName) return;
    await upsertProfile({
      provider: newModel.provider,
      modelName: newModel.modelName,
      displayName: newModel.displayName || undefined,
    });
    setNewModel({ provider: "", modelName: "", displayName: "" });
    setShowAdd(false);
  };

  const formatContext = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
    return `${tokens}`;
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">模型广场</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          添加模型
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border rounded-md"
          />
        </div>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-background border rounded-md"
        >
          <option value="all">全部提供商</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Add Model Form */}
      {showAdd && (
        <div className="p-3 rounded-lg border bg-muted/50 space-y-2 mb-4">
          <div className="grid grid-cols-3 gap-2">
            <select
              value={newModel.provider}
              onChange={(e) => setNewModel({ ...newModel, provider: e.target.value })}
              className="px-2.5 py-1.5 text-xs bg-background border rounded-md"
            >
              <option value="">选择提供商</option>
              {providers.filter((p) => p.enabled).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={newModel.modelName}
              onChange={(e) => setNewModel({ ...newModel, modelName: e.target.value })}
              placeholder="模型 ID (如 gpt-4o)"
              className="px-2.5 py-1.5 text-xs bg-background border rounded-md font-mono"
            />
            <input
              type="text"
              value={newModel.displayName}
              onChange={(e) => setNewModel({ ...newModel, displayName: e.target.value })}
              placeholder="显示名称 (可选)"
              className="px-2.5 py-1.5 text-xs bg-background border rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleAddModel} disabled={!newModel.provider || !newModel.modelName || isLoading}>
              添加
            </Button>
          </div>
        </div>
      )}

      {/* Model List */}
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_100px_80px_60px_40px] gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
          <span className="w-6" />
          <span>模型</span>
          <span>提供商</span>
          <span>上下文</span>
          <span>能力</span>
          <span />
        </div>

        {filtered.map((profile) => {
          const isActive = profile.id === activeModelId;
          const provider = providers.find((p) => p.id === profile.provider);
          return (
            <div
              key={profile.id}
              className={`grid grid-cols-[auto_1fr_100px_80px_60px_40px] gap-2 items-center px-2 py-2 rounded-md transition-colors ${
                isActive ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"
              }`}
            >
              <button
                onClick={() => setActiveModel(profile.id)}
                className="w-6 flex justify-center"
                title={isActive ? "当前模型" : "设为默认"}
              >
                <Star className={`h-3.5 w-3.5 ${isActive ? "text-primary fill-primary" : "text-muted-foreground"}`} />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile.displayName}
                  {isActive && <span className="ml-1.5 text-xs text-primary">当前</span>}
                </p>
                <p className="text-xs text-muted-foreground font-mono truncate">{profile.modelName}</p>
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {provider?.name ?? profile.provider}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatContext(profile.limits.contextWindow)}
              </span>
              <div className="flex gap-0.5">
                {profile.capabilities.toolCalling && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600">工具</span>
                )}
                {profile.capabilities.vision && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-600">视觉</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteProfile(profile.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            {search || filterProvider !== "all" ? "没有匹配的模型" : "暂无模型，点击上方添加"}
          </p>
        )}
      </div>
    </Card>
  );
}

// ---- Section 3: Active Config ----

function ActiveConfigSection({
  activeModelId,
  profiles,
  rules,
  isCustom,
  isLoading,
}: {
  activeModelId: string | null;
  profiles: { id: string; displayName: string; modelName: string }[];
  rules: RoutingRule[];
  isCustom: boolean;
  isLoading: boolean;
}) {
  const { setActiveModel, updateRoutingRules } = useModelStore();
  const [localRules, setLocalRules] = useState<RoutingRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    setLocalRules(rules.map((r) => ({ ...r })));
    setDirty(false);
  }, [rules]);

  const updateRule = (index: number, field: keyof RoutingRule, value: string) => {
    const updated = [...localRules];
    updated[index] = { ...updated[index], [field]: value } as RoutingRule;
    setLocalRules(updated);
    setDirty(true);
  };

  const addRule = () => {
    setLocalRules([...localRules, { taskType: "chat", modelId: profiles[0]?.id ?? "" }]);
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setLocalRules(localRules.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleSave = async () => {
    await updateRoutingRules(localRules);
    setDirty(false);
  };

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium mb-3">当前配置</h3>

      {/* Active Model */}
      <div className="mb-4">
        <label className="text-xs text-muted-foreground mb-1 block">默认模型</label>
        <select
          value={activeModelId ?? ""}
          onChange={(e) => setActiveModel(e.target.value)}
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm bg-background border rounded-md"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName || p.modelName}
            </option>
          ))}
        </select>
      </div>

      {/* Routing Rules Toggle */}
      <button
        onClick={() => setShowRules(!showRules)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        {showRules ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        路由规则
        {isCustom && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">自定义</span>
        )}
      </button>

      {showRules && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-2 text-xs text-muted-foreground">
            <span>任务类型</span>
            <span>目标模型</span>
            <span />
          </div>
          {localRules.map((rule, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
              <select
                value={rule.taskType}
                onChange={(e) => updateRule(i, "taskType", e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-background border rounded-md"
              >
                {Object.entries(taskTypeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <select
                value={rule.modelId}
                onChange={(e) => updateRule(i, "modelId", e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-background border rounded-md"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName || p.modelName}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRule(i)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={addRule} className="gap-1 text-xs">
              <Plus className="h-3 w-3" />
              添加规则
            </Button>
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={isLoading} className="gap-1.5 text-xs">
                保存规则
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
