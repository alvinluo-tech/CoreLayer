import { useState } from 'react';
import { ArrowRight, RefreshCw, FlaskConical, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useModelStore } from '@/stores/modelStore';
import type { RoutingRule } from '@/lib/tauri';
import { TASK_TYPE_LABELS, getProviderColor } from './constants';

/* ───────────── model select ───────────── */
function ModelSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { modelProfiles } = useModelStore();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring min-w-[160px]"
    >
      <option value="">未指定</option>
      {modelProfiles.map((m) => (
        <option key={m.id} value={m.id}>
          {m.displayName} ({m.provider})
        </option>
      ))}
    </select>
  );
}

/* ───────────── rule row ───────────── */
function RuleRow({
  rule,
  onModelChange,
}: {
  rule: RoutingRule;
  onModelChange: (modelId: string) => void;
}) {
  const { modelProfiles } = useModelStore();
  const target = modelProfiles.find((m) => m.id === rule.modelId);
  const color = target ? getProviderColor(target.provider) : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
      {/* task type */}
      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <Badge variant="outline" className="text-[11px] px-2 py-0.5 font-medium">
          {TASK_TYPE_LABELS[rule.taskType] ?? rule.taskType}
        </Badge>
      </div>

      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

      {/* target model */}
      <div className="flex-1 flex items-center gap-2">
        {color && <span className={`h-2 w-2 rounded-full ${color.dot}`} aria-hidden />}
        <ModelSelect value={rule.modelId} onChange={onModelChange} />
      </div>
    </div>
  );
}

/* ───────────── route tester ───────────── */
function RouteTester({ rules }: { rules: RoutingRule[] }) {
  const { modelProfiles } = useModelStore();
  const [taskType, setTaskType] = useState('chat');

  const matched = rules.find((r) => r.taskType === taskType);
  const model = matched ? modelProfiles.find((m) => m.id === matched.modelId) : null;
  const color = model ? getProviderColor(model.provider) : null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">路由测试</h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        选择任务类型，查看当前规则会把请求路由到哪个模型
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {Object.entries(TASK_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <ArrowRight className="h-4 w-4 text-muted-foreground" />

        {model ? (
          <div className="flex items-center gap-2">
            {color && <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} aria-hidden />}
            <span className="text-sm font-medium">{model.displayName}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {model.provider}
            </Badge>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {matched ? '规则指向的模型不存在' : '无匹配规则 · 使用默认模型'}
          </span>
        )}
      </div>

      {model && (
        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
          匹配原因：任务类型「{TASK_TYPE_LABELS[taskType] ?? taskType}」命中路由规则 →{' '}
          <span className="text-foreground">{model.modelName}</span>
        </p>
      )}
    </div>
  );
}

/* ───────────── main tab ───────────── */
export function RoutingTab() {
  const { routingRules, routingRulesCustom, updateRoutingRules, fetchAll, isLoading } =
    useModelStore();

  // Local editable copy
  const [draft, setDraft] = useState<RoutingRule[]>(routingRules);
  const [saving, setSaving] = useState(false);

  // Sync draft when store changes (e.g. after fetch)
  const rulesKey = routingRules.map((r) => `${r.taskType}:${r.modelId}`).join('|');
  const [lastKey, setLastKey] = useState(rulesKey);
  if (rulesKey !== lastKey) {
    setLastKey(rulesKey);
    setDraft(routingRules);
  }

  // Ensure all known task types exist as rows
  const taskTypes = Object.keys(TASK_TYPE_LABELS);
  const draftMap = new Map(draft.map((r) => [r.taskType, r]));
  const displayRules: RoutingRule[] = taskTypes.map(
    (t) => draftMap.get(t) ?? { taskType: t, modelId: '' }
  );

  const dirty =
    displayRules
      .filter((r) => r.modelId)
      .map((r) => `${r.taskType}:${r.modelId}`)
      .sort()
      .join('|') !==
    routingRules
      .filter((r) => r.modelId)
      .map((r) => `${r.taskType}:${r.modelId}`)
      .sort()
      .join('|');

  function updateRule(taskType: string, modelId: string) {
    setDraft((prev) => {
      const next = prev.filter((r) => r.taskType !== taskType);
      if (modelId) next.push({ taskType, modelId });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await updateRoutingRules(displayRules.filter((r) => r.modelId));
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">将不同任务类型路由到最合适的模型</p>
          <Badge
            variant={routingRulesCustom ? 'default' : 'secondary'}
            className="text-[10px] px-1.5 py-0"
          >
            {routingRulesCustom ? '自定义规则' : '默认规则'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            onClick={fetchAll}
            disabled={isLoading}
            aria-label="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中…' : '保存规则'}
          </Button>
        </div>
      </div>

      {/* rules list */}
      <div className="space-y-1.5">
        {displayRules.map((rule) => (
          <RuleRow
            key={rule.taskType}
            rule={rule}
            onModelChange={(modelId) => updateRule(rule.taskType, modelId)}
          />
        ))}
      </div>

      {/* tester */}
      <RouteTester rules={displayRules.filter((r) => r.modelId)} />
    </div>
  );
}
