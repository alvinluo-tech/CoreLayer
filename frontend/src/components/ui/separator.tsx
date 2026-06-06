import * as React from 'react';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: 'horizontal' | 'vertical';
    variant?: 'default' | 'gradient';
  }
>(({ className, orientation = 'horizontal', variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'shrink-0',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      variant === 'default'
        ? 'bg-[var(--glass-border)]'
        : 'bg-gradient-to-r from-transparent via-[var(--cyan-dim)] to-transparent',
      className
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
