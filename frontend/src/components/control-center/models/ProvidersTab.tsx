import { useState } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
  Zap,
  KeyRound,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useModelStore, type ProviderEntry } from '@/stores/modelStore';
import { StatusDot } from './StatusDot';
import { getProviderColor } from './constants';

/* ───────────── types ───────────── */
interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

/* ───────────── provider card ───────────── */
function ProviderCard({ provider }: { provider: ProviderEntry }) {
  const { updateProvider, removeProvider, testProvider, discoverAndSeed } = useModelStore();
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState(provider.baseURL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    seeded: number;
    skipped: number;
    error?: string;
  } | null>(null);

  const color = getProviderColor(provider.id);

  // Derive status from actual test result when available
  const dotStatus = testResult
    ? testResult.success
      ? 'online'
      : 'offline'
    : provider.enabled
      ? 'unconfigured'
      : 'offline';

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testProvider(provider.id);
    setTestResult(result);
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    await updateProvider(provider.id, {
      ...(apiKey ? { apiKey } : {}),
      baseURL: baseURL || undefined,
    });
    setSaving(false);
    setApiKey('');
    setExpanded(false);
  }

  async function handleToggle(enabled: boolean) {
    await updateProvider(provider.id, { enabled });
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverResult(null);
    const result = await discoverAndSeed(provider.id);
    setDiscoverResult(result);
    setDiscovering(false);
  }

  return (
    <div className={`rounded-xl border ${color.border} ${color.bg} transition-all`}>
      {/* header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* expand toggle */}
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* provider dot */}
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${color.dot}`} aria-hidden />

        {/* name */}
        <span className={`flex-1 text-sm font-semibold ${color.text}`}>{provider.name}</span>

        {/* model count */}
        <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">
          {provider.modelCount} 个模型
        </Badge>

        {/* status */}
        <StatusDot status={dotStatus} />

        {/* test button */}
        <button
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          onClick={handleTest}
          disabled={testing}
          title="测试连接"
          aria-label="测试连接"
        >
          <Zap className={`h-3.5 w-3.5 ${testing ? 'animate-pulse' : ''}`} />
        </button>

        {/* enable toggle */}
        <button
          role="switch"
          aria-checked={provider.enabled}
          aria-label={provider.enabled ? '已启用，点击禁用' : '已禁用，点击启用'}
          onClick={() => handleToggle(!provider.enabled)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
            provider.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              provider.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* test result banner */}
      {testResult && (
        <div
          className={`mx-4 mb-2 rounded-md px-3 py-1.5 text-[11px] flex items-center gap-2 ${
            testResult.success
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {testResult.success ? (
            <>连接成功 · 延迟 {testResult.latencyMs ?? '—'}ms</>
          ) : (
            <>连接失败 · {testResult.error ?? '未知错误'}</>
          )}
        </div>
      )}

      {/* expanded: edit form */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
          {/* ── discover section ── */}
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  模型库 · {provider.modelCount} 个已注册
                </span>
              </div>
              <button
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
                onClick={handleDiscover}
                disabled={discovering}
              >
                {discovering ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    发现中…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    发现并同步模型
                  </>
                )}
              </button>
            </div>

            {discoverResult && (
              <div
                className={`flex items-center gap-1.5 text-[11px] ${
                  discoverResult.error
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {discoverResult.error ? (
                  <>{discoverResult.error}</>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {discoverResult.seeded > 0
                      ? `新增 ${discoverResult.seeded} 个模型`
                      : '全部已是最新'}
                    {discoverResult.skipped > 0 && (
                      <span className="text-muted-foreground">
                        · {discoverResult.skipped} 个已存在
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              从提供商 API 拉取可用模型列表，自动注册到模型库。已注册的不会重复添加。
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <KeyRound className="h-3 w-3" />
              API Key（留空保持不变）
            </label>
            <Input
              type="password"
              placeholder={provider.apiKey ? '••••••••（已设置）' : '输入 API Key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Base URL</label>
            <Input
              placeholder="https://api.example.com/v1"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            {/* delete */}
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-[11px] text-rose-600">
                <span>确认删除？</span>
                <button
                  className="font-semibold hover:underline"
                  onClick={() => removeProvider(provider.id)}
                >
                  确认
                </button>
                <button
                  className="text-muted-foreground hover:underline"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="text-[11px] text-muted-foreground hover:text-rose-500 flex items-center gap-1 transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3 w-3" />
                删除提供商
              </button>
            )}

            <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={handleSave}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── add provider dialog ───────────── */
function AddProviderDialog() {
  const { providerPresets, providers, addProvider, addCustomProvider } = useModelStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [customId, setCustomId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customBaseURL, setCustomBaseURL] = useState('');
  const [loading, setLoading] = useState(false);

  const addedIds = new Set(providers.map((p) => p.id));
  const availablePresets = providerPresets.filter((p) => !addedIds.has(p.id));

  async function handleAdd() {
    setLoading(true);
    if (mode === 'preset' && selectedPreset) {
      await addProvider(selectedPreset, apiKey || undefined);
    } else if (mode === 'custom' && customId && customName && customBaseURL) {
      await addCustomProvider({
        id: customId,
        name: customName,
        baseURL: customBaseURL,
        apiKey: apiKey || undefined,
      });
    }
    setLoading(false);
    setOpen(false);
    setSelectedPreset('');
    setApiKey('');
  }

  const preset = providerPresets.find((p) => p.id === selectedPreset);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        添加提供商
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogContent className="max-w-sm" onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle className="text-sm">添加 AI 提供商</DialogTitle>
          </DialogHeader>

          {/* mode selector */}
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {(['preset', 'custom'] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                onClick={() => setMode(m)}
              >
                {m === 'preset' ? '预设提供商' : '自定义'}
              </button>
            ))}
          </div>

          {mode === 'preset' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {availablePresets.map((p) => {
                  const c = getProviderColor(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`rounded-lg border px-3 py-2 text-left transition-all text-xs font-medium ${
                        selectedPreset === p.id
                          ? `${c.border} ${c.bg} ${c.text} ring-1 ring-current/30`
                          : 'border-border hover:border-primary/30'
                      }`}
                      onClick={() => setSelectedPreset(p.id)}
                    >
                      <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${c.dot}`} />
                      {p.nameCN || p.name}
                    </button>
                  );
                })}
                {availablePresets.length === 0 && (
                  <p className="col-span-2 text-center text-muted-foreground text-[11px] py-4">
                    所有预设提供商已添加
                  </p>
                )}
              </div>
              {preset?.requiresApiKey && (
                <Input
                  type="password"
                  placeholder="API Key（必填）"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-8 text-sm"
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="ID（如 my-openai）"
                value={customId}
                onChange={(e) => setCustomId(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="显示名称"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Base URL"
                value={customBaseURL}
                onChange={(e) => setCustomBaseURL(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="password"
                placeholder="API Key（可选）"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}

          <Button
            className="w-full h-8 text-sm mt-1"
            disabled={
              loading ||
              (mode === 'preset' ? !selectedPreset : !customId || !customName || !customBaseURL)
            }
            onClick={handleAdd}
          >
            {loading ? '添加中…' : '确认添加'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── main tab ───────────── */
export function ProvidersTab() {
  const { providers, fetchAll, isLoading } = useModelStore();

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {providers.length} 个提供商 · 点击卡片展开配置
        </p>
        <div className="flex items-center gap-2">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            onClick={fetchAll}
            disabled={isLoading}
            aria-label="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <AddProviderDialog />
        </div>
      </div>

      {/* provider cards */}
      {providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          暂无提供商，点击"添加提供商"开始配置
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}
    </div>
  );
}
