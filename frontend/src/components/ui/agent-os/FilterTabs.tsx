interface FilterTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterTabsProps<T extends string> {
  tabs: FilterTab<T>[];
  active: T;
  onChange: (value: T) => void;
}

export function FilterTabs<T extends string>({ tabs, active, onChange }: FilterTabsProps<T>) {
  return (
    <div
      className="flex items-center gap-1 px-3 py-2"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className="flex items-center gap-1.5"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            border:
              active === tab.value ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
            background: active === tab.value ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: active === tab.value ? 'var(--cyan)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span
              style={{
                fontSize: 9,
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-tertiary)',
                padding: '0 4px',
                borderRadius: 3,
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
