import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SettingsCardProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function SettingsCard({ title, icon: Icon, children, className }: SettingsCardProps) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {title}
      </h3>
      {children}
    </Card>
  );
}
