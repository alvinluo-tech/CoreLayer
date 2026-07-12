import { useState } from 'react';
import { Star, Trash2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useModelStore } from '@/stores/modelStore';
import type { ModelProfile } from '@/lib/tauri';
import { getProviderColor } from './constants';

/* ───────────── helpers ───────────── */
function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtCost(v: number): string {
  if (v === 0) return '免费';
  return `$${v.toFixed(4)}`;
}

const CAP_LABELS: Record<string, string> = {
  vision: '视觉',
  toolCalling: '工具调用',
  jsonMode: 'JSON',
  longContext: '长文本',
  tts: 'TTS',
  audioInput: '音频',
};

/* ───────────── model row ───────────── */
function ModelRow({ profile, isActive }: { profile: ModelProfile; isActive: boolean }) {
  const { setActiveModel, deleteProfile } = useModelStore();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingActive, setSettingActive] = useState(false);

  const color = getProviderColor(profile.provider);
  const caps = Object.entries(profile.capabilities)
    .filter(([k, v]) => v && CAP_LABELS[k])
    .map(([k]) => k);

  async function handleSetActive() {
    setSettingActive(true);
    await setActiveModel(profile.id);
    setSettingActive(false);
  }

  return (
    <div
      className={`rounded-lg border transition-all ${
        isActive ? 'border-primary/40 bg-primary/[0.03]' : 'border-border/60 hover:border-border'
      }`}
    >
      {/* main row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* expand */}
        <button
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* provider dot */}
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${color.dot}`} aria-hidden />

        {/* name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{profile.displayName}</span>
            {isActive && (
              <Badge className="text-[10px] px-1 py-0 bg-primary/15 text-primary border-0 font-medium">
                当前激活
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {profile.provider} · {profile.modelName}
          </p>
        </div>

        {/* caps */}
        <div className="hidden sm:flex items-center gap-1">
          {caps.slice(0, 3).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
              {CAP_LABELS[k]}
            </Badge>
          ))}
          {caps.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{caps.length - 3}</span>
          )}
        </div>

        {/* ctx window */}
        <span className="hidden md:block text-[11px] text-muted-foreground w-12 text-right flex-shrink-0">
          {fmtCtx(profile.limits.contextWindow)}
        </span>

        {/* cost */}
        <span className="text-[11px] text-muted-foreground w-16 text-right flex-shrink-0">
          {fmtCost(profile.cost.input)}/in
        </span>

        {/* set active */}
        <button
          className={`flex-shrink-0 transition-colors ${
            isActive ? 'text-primary' : 'text-muted-foreground hover:text-amber-500'
          } disabled:opacity-40`}
          onClick={handleSetActive}
          disabled={isActive || settingActive}
          title={isActive ? '当前激活' : '设为激活模型'}
          aria-label={isActive ? '当前激活' : '设为激活模型'}
        >
          <Star className={`h-3.5 w-3.5 ${isActive ? 'fill-primary' : ''}`} />
        </button>

        {/* delete — separated by gap */}
        <div className="w-px h-4 bg-border/60 flex-shrink-0" aria-hidden />
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 text-[11px] text-rose-600 flex-shrink-0">
            <button
              className="font-semibold hover:underline"
              onClick={() => deleteProfile(profile.id)}
            >
              删除
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
            className="flex-shrink-0 text-muted-foreground hover:text-rose-500 transition-colors"
            onClick={() => setConfirmDelete(true)}
            title="删除模型"
            aria-label="删除模型"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/40 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
          <Detail label="上下文窗口" value={`${fmtCtx(profile.limits.contextWindow)} tokens`} />
          <Detail label="最大输出" value={`${fmtCtx(profile.limits.maxOutputTokens)} tokens`} />
          <Detail label="输入价格" value={`${fmtCost(profile.cost.input)} / 1k tokens`} />
          <Detail label="输出价格" value={`${fmtCost(profile.cost.output)} / 1k tokens`} />
          <div className="col-span-2 sm:col-span-3">
            <p className="text-[10px] text-muted-foreground mb-1">能力</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(profile.capabilities)
                .filter(([, v]) => v)
                .map(([k]) => (
                  <Badge
                    key={k}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-normal"
                  >
                    {CAP_LABELS[k] ?? k}
                  </Badge>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}

/* ───────────── group by provider ───────────── */
function ProviderGroup({
  providerId,
  profiles,
  activeModelId,
}: {
  providerId: string;
  profiles: ModelProfile[];
  activeModelId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const color = getProviderColor(providerId);

  return (
    <div className="space-y-1.5">
      <button
        className="flex items-center gap-2 w-full text-left group"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`h-2 w-2 rounded-full ${color.dot}`} aria-hidden />
        <span className={`text-xs font-semibold ${color.text}`}>{providerId}</span>
        <span className="text-[11px] text-muted-foreground">({profiles.length})</span>
        <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-1 pl-3 border-l border-border/40">
          {profiles.map((p) => (
            <ModelRow key={p.id} profile={p} isActive={activeModelId === p.id} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── main tab ───────────── */
export function ModelsTab() {
  const { modelProfiles, activeModelId, providers, fetchAll, isLoading } = useModelStore();
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? modelProfiles.filter(
        (p) =>
          p.displayName.toLowerCase().includes(search.toLowerCase()) ||
          p.modelName.toLowerCase().includes(search.toLowerCase()) ||
          p.provider.toLowerCase().includes(search.toLowerCase())
      )
    : modelProfiles;

  // Group by provider
  const grouped = filtered.reduce<Record<string, ModelProfile[]>>((acc, p) => {
    (acc[p.provider] ??= []).push(p);
    return acc;
  }, {});

  // Order groups by provider list order
  const providerOrder = providers.map((p) => p.id);
  const groupEntries = Object.entries(grouped).sort(([a], [b]) => {
    const ai = providerOrder.indexOf(a);
    const bi = providerOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="搜索模型…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          onClick={fetchAll}
          disabled={isLoading}
          aria-label="刷新"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* stats */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{filtered.length} 个模型</span>
        {activeModelId && (
          <>
            <span className="text-border/60">·</span>
            <span>
              激活：<span className="text-foreground font-medium">{activeModelId}</span>
            </span>
          </>
        )}
      </div>

      {/* column header */}
      {filtered.length > 0 && (
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-10 text-[10px] text-muted-foreground uppercase tracking-wide">
          <span>模型</span>
          <span className="w-28 text-right">能力</span>
          <span className="w-12 text-right">上下文</span>
          <span className="w-16 text-right">输入价格</span>
          <span className="w-8" />
        </div>
      )}

      {/* groups */}
      {groupEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          {search
            ? '没有匹配的模型'
            : '暂无模型 · 前往「提供商」标签页，展开某个提供商点击"发现并同步模型"'}
        </div>
      ) : (
        <div className="space-y-5">
          {groupEntries.map(([pid, profiles]) => (
            <ProviderGroup
              key={pid}
              providerId={pid}
              profiles={profiles}
              activeModelId={activeModelId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
