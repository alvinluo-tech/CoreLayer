import { useEffect, useState } from 'react';
import { useModelStore } from '@/stores/modelStore';
import { ProvidersTab } from './models/ProvidersTab';
import { ModelsTab } from './models/ModelsTab';
import { RoutingTab } from './models/RoutingTab';

/* ───────────── tab config ───────────── */
const TABS = [
  { id: 'providers', label: '提供商', subtitle: '配置 API 密钥与连接' },
  { id: 'models', label: '模型', subtitle: '管理已注册的模型' },
  { id: 'routing', label: '路由', subtitle: '任务类型 → 模型映射' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ───────────── page ───────────── */
export function ModelsPage() {
  const { fetchAll, isLoading, error } = useModelStore();
  const [activeTab, setActiveTab] = useState<TabId>('providers');

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* page header */}
      <div className="px-5 pt-5 pb-0 flex-shrink-0">
        <h1 className="text-base font-semibold">模型配置</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          管理 AI 提供商、模型列表与请求路由规则
        </p>

        {/* error banner */}
        {error && (
          <div className="mt-2 rounded-md bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* tab bar */}
        <div className="mt-4 flex items-end gap-0 border-b border-border/60">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 pb-2.5 pt-1 text-sm font-medium transition-colors focus:outline-none ${
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              {tab.label}
              {/* active indicator */}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}

          {/* loading indicator in header */}
          {isLoading && (
            <span className="ml-auto mb-2.5 mr-1 h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          )}
        </div>
      </div>

      {/* tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'routing' && <RoutingTab />}
      </div>
    </div>
  );
}
