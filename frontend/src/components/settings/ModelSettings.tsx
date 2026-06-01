import { useEffect, useState } from 'react';
import { useModelStore, type ProviderEntry } from '@/stores/modelStore';
import {
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Zap,
  Search,
  Settings2,
  Server,
} from 'lucide-react';

interface ModelSettingsProps {
  className?: string;
}

export function ModelSettings({ className }: ModelSettingsProps) {
  const {
    providers,
    providerPresets,
    activeModelId,
    modelProfiles,
    isLoading,
    error,
    fetchAll,
    addProvider,
    addCustomProvider,
    updateProvider,
    removeProvider,
    discoverModels,
    testProvider,
    setActiveModel,
  } = useModelStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; latencyMs?: number; error?: string }>
  >({});
  const [testingProviders, setTestingProviders] = useState<Set<string>>(new Set());
  const [discoveredModels, setDiscoveredModels] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [discoveringProviders, setDiscoveringProviders] = useState<Set<string>>(new Set());
  const [customAddMode, setCustomAddMode] = useState(false);
  const [customForm, setCustomForm] = useState({ id: '', name: '', baseURL: '', apiKey: '' });

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const unusedPresets = providerPresets.filter((p) => !providers.some((prov) => prov.id === p.id));

  const handleAddFromPreset = async (presetId: string) => {
    const key = apiKeyInput.trim();
    await addProvider(presetId, key || undefined);
    setApiKeyInput('');
    setShowAddForm(false);
  };

  const handleAddCustom = async () => {
    if (!customForm.id || !customForm.name || !customForm.baseURL) return;
    await addCustomProvider({
      id: customForm.id,
      name: customForm.name,
      baseURL: customForm.baseURL,
      apiKey: customForm.apiKey || undefined,
    });
    setCustomForm({ id: '', name: '', baseURL: '', apiKey: '' });
    setCustomAddMode(false);
    setShowAddForm(false);
  };

  const handleSaveApiKey = async (providerId: string) => {
    await updateProvider(providerId, { apiKey: apiKeyInput.trim() });
    setEditingKey(null);
    setApiKeyInput('');
    setShowApiKey(false);
  };

  const handleTest = async (providerId: string) => {
    setTestingProviders((prev) => new Set(prev).add(providerId));
    const result = await testProvider(providerId);
    setTestResults((prev) => ({ ...prev, [providerId]: result }));
    setTestingProviders((prev) => {
      const next = new Set(prev);
      next.delete(providerId);
      return next;
    });
  };

  const handleDiscover = async (providerId: string) => {
    setDiscoveringProviders((prev) => new Set(prev).add(providerId));
    const models = await discoverModels(providerId);
    setDiscoveredModels((prev) => ({ ...prev, [providerId]: models }));
    setDiscoveringProviders((prev) => {
      const next = new Set(prev);
      next.delete(providerId);
      return next;
    });
  };

  const handleRemove = async (providerId: string) => {
    await removeProvider(providerId);
    setExpandedProvider(null);
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5" />
              模型供应商
            </h3>
            <p className="text-sm text-muted-foreground">管理 AI 模型供应商和 API Key</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchAll()}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              添加供应商
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Add Provider Form */}
        {showAddForm && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">添加供应商</h4>
              <button
                onClick={() => setCustomAddMode(!customAddMode)}
                className="text-xs text-primary hover:underline"
              >
                {customAddMode ? '从预设添加' : '自定义添加'}
              </button>
            </div>

            {!customAddMode ? (
              <>
                {/* Preset selector */}
                <div className="space-y-2">
                  {unusedPresets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">所有预设供应商已添加</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {unusedPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleAddFromPreset(preset.id)}
                          className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-accent/50 transition-colors"
                        >
                          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{preset.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {preset.defaultBaseURL}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* API Key input for preset */}
                <div>
                  <label className="text-xs text-muted-foreground">
                    API Key（可选，稍后也可配置）
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                  />
                </div>
              </>
            ) : (
              <>
                {/* Custom provider form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">ID</label>
                    <input
                      type="text"
                      value={customForm.id}
                      onChange={(e) => setCustomForm({ ...customForm, id: e.target.value })}
                      placeholder="my-provider"
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">名称</label>
                    <input
                      type="text"
                      value={customForm.name}
                      onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                      placeholder="My Provider"
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Base URL</label>
                    <input
                      type="text"
                      value={customForm.baseURL}
                      onChange={(e) => setCustomForm({ ...customForm, baseURL: e.target.value })}
                      placeholder="https://api.example.com/v1"
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">API Key（可选）</label>
                    <input
                      type="password"
                      value={customForm.apiKey}
                      onChange={(e) => setCustomForm({ ...customForm, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border rounded-md"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAddCustom}
                    disabled={!customForm.id || !customForm.name || !customForm.baseURL}
                    className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    添加
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setCustomAddMode(false);
                  setApiKeyInput('');
                }}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Provider List */}
        <div className="space-y-3">
          {providers.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无供应商配置</p>
              <p className="text-xs mt-1">点击"添加供应商"开始配置</p>
            </div>
          )}

          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              expanded={expandedProvider === provider.id}
              onToggle={() =>
                setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
              }
              isTesting={testingProviders.has(provider.id)}
              testResult={testResults[provider.id]}
              onTest={() => handleTest(provider.id)}
              onRemove={() => handleRemove(provider.id)}
              onToggleEnabled={() => updateProvider(provider.id, { enabled: !provider.enabled })}
              editingKey={editingKey === provider.id}
              onStartEditKey={() => {
                setEditingKey(provider.id);
                setApiKeyInput('');
                setShowApiKey(false);
              }}
              onCancelEditKey={() => {
                setEditingKey(null);
                setApiKeyInput('');
                setShowApiKey(false);
              }}
              onSaveKey={() => handleSaveApiKey(provider.id)}
              apiKeyInput={apiKeyInput}
              setApiKeyInput={setApiKeyInput}
              showApiKey={showApiKey}
              setShowApiKey={setShowApiKey}
              discoveredModels={discoveredModels[provider.id]}
              isDiscovering={discoveringProviders.has(provider.id)}
              onDiscover={() => handleDiscover(provider.id)}
              modelProfiles={modelProfiles.filter((mp) => mp.provider === provider.id)}
            />
          ))}
        </div>

        {/* Active Model */}
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Settings2 className="h-4 w-4" />
            当前活跃模型
          </h3>
          <div className="flex items-center gap-3">
            <select
              value={activeModelId ?? ''}
              onChange={(e) => setActiveModel(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-background border rounded-md"
            >
              <option value="">未选择</option>
              {modelProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} ({profile.provider}/{profile.modelName})
                </option>
              ))}
            </select>
            {activeModelId && (
              <span className="text-xs text-muted-foreground">
                {modelProfiles.find((p) => p.id === activeModelId)?.displayName}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Provider Card Sub-component ---------- */

interface ProviderCardProps {
  provider: ProviderEntry;
  expanded: boolean;
  onToggle: () => void;
  isTesting: boolean;
  testResult?: { success: boolean; latencyMs?: number; error?: string; keyConfigured?: boolean };
  onTest: () => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
  editingKey: boolean;
  onStartEditKey: () => void;
  onCancelEditKey: () => void;
  onSaveKey: () => void;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  discoveredModels?: { id: string; name: string }[];
  isDiscovering: boolean;
  onDiscover: () => void;
  modelProfiles: { id: string; displayName: string; modelName: string }[];
}

function ProviderCard({
  provider,
  expanded,
  onToggle,
  isTesting,
  testResult,
  onTest,
  onRemove,
  onToggleEnabled,
  editingKey,
  onStartEditKey,
  onCancelEditKey,
  onSaveKey,
  apiKeyInput,
  setApiKeyInput,
  showApiKey,
  setShowApiKey,
  discoveredModels,
  isDiscovering,
  onDiscover,
  modelProfiles,
}: ProviderCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border bg-card transition-colors ${
        provider.enabled ? 'hover:bg-accent/50' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <button
            onClick={onToggleEnabled}
            className={`mt-0.5 h-5 w-9 rounded-full transition-colors relative shrink-0 ${
              provider.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            title={provider.enabled ? '禁用' : '启用'}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                provider.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
              <h4 className="text-sm font-medium truncate">{provider.name}</h4>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                {provider.type}
              </span>
              {testResult && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    testResult.success
                      ? testResult.keyConfigured
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-yellow-500/10 text-yellow-600'
                      : 'bg-red-500/10 text-red-600'
                  }`}
                >
                  {testResult.success
                    ? testResult.keyConfigured
                      ? `${testResult.latencyMs}ms`
                      : '无 Key'
                    : '失败'}
                </span>
              )}
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
              )}
            </button>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{provider.baseURL}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                API Key: {provider.apiKey || '未设置'}
              </span>
              <span className="text-xs text-muted-foreground">{modelProfiles.length} 个模型</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 ml-2">
          <button
            onClick={onTest}
            disabled={isTesting}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="测试连接"
          >
            {isTesting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>测试中</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                <span>测试</span>
              </>
            )}
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="删除供应商"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-border/40 space-y-4">
          {/* API Key section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">API Key</span>
              {!editingKey ? (
                <button onClick={onStartEditKey} className="text-xs text-primary hover:underline">
                  修改
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={onCancelEditKey}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </button>
                  <button onClick={onSaveKey} className="text-xs text-primary hover:underline">
                    保存
                  </button>
                </div>
              )}
            </div>
            {editingKey ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="输入新的 API Key..."
                    className="w-full px-3 py-1.5 text-sm bg-background border rounded-md pr-9"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <button
                  onClick={onSaveKey}
                  disabled={!apiKeyInput.trim()}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-mono">
                {provider.apiKey || '未设置 API Key'}
              </p>
            )}
          </div>

          {/* Connection test result */}
          {isTesting && (
            <div className="p-2.5 rounded-md text-xs bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
              <span className="flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在测试到 {provider.baseURL} 的连接...
              </span>
            </div>
          )}
          {!isTesting && testResult && (
            <div
              className={`p-2.5 rounded-md text-xs ${
                testResult.success
                  ? testResult.keyConfigured
                    ? 'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400'
                    : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400'
              }`}
            >
              {testResult.success ? (
                testResult.keyConfigured ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    连接成功，API Key 已验证，延迟 {testResult.latencyMs}ms
                  </span>
                ) : (
                  <span className="flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      端点可达，但未配置 API Key。部分供应商的模型列表是公开的，但聊天时仍需 Key。
                      {testResult.latencyMs != null && (
                        <span className="text-muted-foreground ml-1">
                          ({testResult.latencyMs}ms)
                        </span>
                      )}
                    </span>
                  </span>
                )
              ) : (
                <span className="flex items-start gap-1">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {testResult.error || '连接失败'}
                    {testResult.latencyMs != null && testResult.latencyMs > 0 && (
                      <span className="text-muted-foreground ml-1">({testResult.latencyMs}ms)</span>
                    )}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Discover models */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">可用模型</span>
              <button
                onClick={onDiscover}
                disabled={isDiscovering}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              >
                {isDiscovering ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Search className="h-3 w-3" />
                )}
                发现模型
              </button>
            </div>
            {discoveredModels && discoveredModels.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {discoveredModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 text-xs"
                  >
                    <span className="font-mono text-foreground">{m.id}</span>
                    {m.name !== m.id && <span className="text-muted-foreground">({m.name})</span>}
                  </div>
                ))}
              </div>
            )}
            {discoveredModels && discoveredModels.length === 0 && (
              <p className="text-xs text-muted-foreground">未发现模型</p>
            )}
          </div>

          {/* Registered model profiles */}
          {modelProfiles.length > 0 && (
            <div>
              <span className="text-xs font-medium text-foreground block mb-2">
                已注册的模型配置
              </span>
              <div className="space-y-1">
                {modelProfiles.map((mp) => (
                  <div
                    key={mp.id}
                    className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 text-xs"
                  >
                    <span className="font-medium text-foreground">{mp.displayName}</span>
                    <span className="text-muted-foreground font-mono">{mp.modelName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
