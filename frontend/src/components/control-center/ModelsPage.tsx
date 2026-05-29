import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Eye,
  EyeOff,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useModelStore } from "@/stores/modelStore";
import type { RoutingRule } from "@/lib/tauri";

const providerLabels: Record<string, string> = {
  mimo: "MiMo (小米)",
  groq: "Groq",
  openrouter: "OpenRouter",
  local: "Ollama (本地)",
};

const taskTypeLabels: Record<string, string> = {
  chat: "默认聊天",
  fast: "快速响应",
  reasoning: "深度推理",
  toolAgent: "工具调用",
  private: "隐私模式",
};

export function ModelsPage() {
  const {
    providerConfigs,
    routingRules,
    routingRulesCustom,
    activeModelId,
    modelProfiles,
    isLoading,
    error,
    fetchAll,
    updateProvider,
    updateRoutingRules,
    setActiveModel,
    upsertProfile,
    deleteProfile,
  } = useModelStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">模型管理</h2>
          <p className="text-sm text-muted-foreground">配置 AI 提供商、路由规则和模型</p>
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

      {/* Section 1: Provider Config */}
      <ProviderConfigsSection
        configs={providerConfigs}
        isLoading={isLoading}
        onSave={updateProvider}
      />

      {/* Section 2: Active Model */}
      <ActiveModelSection
        activeModelId={activeModelId}
        profiles={modelProfiles}
        isLoading={isLoading}
        onChange={setActiveModel}
      />

      {/* Section 3: Routing Rules */}
      <RoutingRulesSection
        rules={routingRules}
        isCustom={routingRulesCustom}
        profiles={modelProfiles}
        isLoading={isLoading}
        onSave={updateRoutingRules}
      />

      {/* Section 4: Model Profiles */}
      <ModelProfilesSection
        profiles={modelProfiles}
        activeModelId={activeModelId}
        isLoading={isLoading}
        onUpsert={upsertProfile}
        onDelete={deleteProfile}
        onSetActive={setActiveModel}
      />
    </div>
  );
}

// ---- Section 1: Provider Config ----

function ProviderConfigsSection({
  configs,
  isLoading,
  onSave,
}: {
  configs: Record<string, { apiKey: string; baseURL: string }>;
  isLoading: boolean;
  onSave: (name: string, config: { apiKey?: string; baseURL?: string }) => Promise<void>;
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium mb-4">提供商配置</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(providerLabels).map(([key, label]) => (
          <ProviderCard
            key={key}
            name={key}
            label={label}
            config={configs[key]}
            isLoading={isLoading}
            onSave={onSave}
          />
        ))}
      </div>
    </Card>
  );
}

function ProviderCard({
  name,
  label,
  config,
  isLoading,
  onSave,
}: {
  name: string;
  label: string;
  config: { apiKey: string; baseURL: string } | undefined;
  isLoading: boolean;
  onSave: (name: string, config: { apiKey?: string; baseURL?: string }) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setBaseURL(config.baseURL);
      setApiKey(""); // Don't pre-fill masked key in editable field
    }
  }, [config]);

  const handleSave = async () => {
    const updates: { apiKey?: string; baseURL?: string } = {};
    if (apiKey) updates.apiKey = apiKey;
    if (baseURL !== (config?.baseURL ?? "")) updates.baseURL = baseURL;
    if (Object.keys(updates).length === 0) return;
    await onSave(name, updates);
    setApiKey("");
    setDirty(false);
  };

  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div>
        <label className="text-xs text-muted-foreground">API Key</label>
        <div className="relative mt-0.5">
          <input
            type={showKey ? "text" : "password"}
            value={showKey && apiKey ? apiKey : (config?.apiKey ?? "")}
            onChange={(e) => {
              setApiKey(e.target.value);
              setDirty(true);
            }}
            onFocus={() => {
              if (!apiKey) setApiKey("");
              setShowKey(false);
            }}
            placeholder={config?.apiKey ? "已配置 (留空保持不变)" : "输入 API Key"}
            className="w-full px-2.5 py-1.5 text-xs bg-background border rounded-md pr-8"
            readOnly={showKey && !apiKey && !!config?.apiKey}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Base URL</label>
        <input
          type="text"
          value={baseURL}
          onChange={(e) => {
            setBaseURL(e.target.value);
            setDirty(true);
          }}
          placeholder="https://api.example.com/v1"
          className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-background border rounded-md font-mono"
        />
      </div>
      {dirty && (
        <Button size="sm" onClick={handleSave} disabled={isLoading} className="w-full gap-1.5">
          <Save className="h-3.5 w-3.5" />
          保存
        </Button>
      )}
    </div>
  );
}

// ---- Section 2: Active Model ----

function ActiveModelSection({
  activeModelId,
  profiles,
  isLoading,
  onChange,
}: {
  activeModelId: string | null;
  profiles: { id: string; displayName: string; provider: string; modelName: string }[];
  isLoading: boolean;
  onChange: (id: string) => Promise<void>;
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium mb-3">当前模型</h3>
      <select
        value={activeModelId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        className="w-full px-3 py-2 text-sm bg-background border rounded-md"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName || p.modelName} ({p.provider})
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground mt-2">
        选择默认使用的 AI 模型。路由规则中的特殊场景会覆盖此选择。
      </p>
    </Card>
  );
}

// ---- Section 3: Routing Rules ----

function RoutingRulesSection({
  rules,
  isCustom,
  profiles,
  isLoading,
  onSave,
}: {
  rules: RoutingRule[];
  isCustom: boolean;
  profiles: { id: string; displayName: string; modelName: string }[];
  isLoading: boolean;
  onSave: (rules: RoutingRule[]) => Promise<void>;
}) {
  const [localRules, setLocalRules] = useState<RoutingRule[]>([]);
  const [dirty, setDirty] = useState(false);

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
    await onSave(localRules);
    setDirty(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">
          路由规则
          {isCustom && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
              自定义
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={addRule} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            添加
          </Button>
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={isLoading} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              保存
            </Button>
          )}
        </div>
      </div>
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
        {localRules.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">无路由规则</p>
        )}
      </div>
    </Card>
  );
}

// ---- Section 4: Model Profiles ----

function ModelProfilesSection({
  profiles,
  activeModelId,
  isLoading,
  onUpsert,
  onDelete,
  onSetActive,
}: {
  profiles: { id: string; provider: string; modelName: string; displayName: string | null; capabilities: Record<string, boolean> | null }[];
  activeModelId: string | null;
  isLoading: boolean;
  onUpsert: (profile: {
    provider: string;
    modelName: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetActive: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newProfile, setNewProfile] = useState({
    provider: "mimo",
    modelName: "",
    displayName: "",
  });

  const handleAdd = async () => {
    if (!newProfile.modelName) return;
    await onUpsert({
      provider: newProfile.provider,
      modelName: newProfile.modelName,
      displayName: newProfile.displayName || undefined,
    });
    setNewProfile({ provider: "mimo", modelName: "", displayName: "" });
    setShowAdd(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">模型配置</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </Button>
      </div>

      {showAdd && (
        <div className="p-3 rounded-lg border bg-muted/50 space-y-2 mb-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">提供商</label>
              <select
                value={newProfile.provider}
                onChange={(e) => setNewProfile({ ...newProfile, provider: e.target.value })}
                className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-background border rounded-md"
              >
                {Object.entries(providerLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">模型名称</label>
              <input
                type="text"
                value={newProfile.modelName}
                onChange={(e) => setNewProfile({ ...newProfile, modelName: e.target.value })}
                placeholder="mimo-v2.5-pro"
                className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-background border rounded-md"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">显示名称</label>
              <input
                type="text"
                value={newProfile.displayName}
                onChange={(e) => setNewProfile({ ...newProfile, displayName: e.target.value })}
                placeholder="MiMo v2.5 Pro"
                className="w-full mt-0.5 px-2.5 py-1.5 text-xs bg-background border rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newProfile.modelName || isLoading}>
              添加
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {profiles.map((profile) => {
          const isActive = profile.id === activeModelId;
          return (
            <div
              key={profile.id}
              className={`p-3 rounded-lg border flex items-center justify-between ${isActive ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.displayName || profile.modelName}
                    {isActive && (
                      <Star className="h-3 w-3 text-primary inline ml-1" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {providerLabels[profile.provider] ?? profile.provider} / {profile.modelName}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!isActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSetActive(profile.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    title="设为默认"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(profile.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">暂无模型配置</p>
        )}
      </div>
    </Card>
  );
}
