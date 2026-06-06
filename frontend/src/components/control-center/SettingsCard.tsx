import type { LucideIcon } from 'lucide-react';

interface SettingsCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function SettingsCard({ title, icon: Icon, children, className }: SettingsCardProps) {
  return (
    <div
      className={`p-5 rounded-xl ${className ?? ''}`}
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <h3
        className="flex items-center gap-2 mb-4"
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.5,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
        }}
      >
        {Icon && <Icon className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />}
        {title}
      </h3>
      {children}
    </div>
  );
}
