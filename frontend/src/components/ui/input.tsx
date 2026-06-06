import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-[var(--glass-border)] bg-transparent px-3 py-1 text-sm transition-all',
          'placeholder:text-[var(--text-tertiary)]',
          'focus-visible:outline-none focus-visible:border-[rgba(0,212,255,0.25)] focus-visible:shadow-[0_0_24px_var(--cyan-glow),inset_0_0_24px_rgba(0,212,255,0.02)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
