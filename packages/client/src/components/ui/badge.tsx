import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  color?: string;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.06] text-text-secondary border-white/[0.06]',
  success: 'bg-success-subtle text-success border-success/20',
  warning: 'bg-warning-subtle text-warning border-warning/20',
  error: 'bg-error-subtle text-error border-error/20',
  info: 'bg-info-subtle text-info border-info/20',
};

export function Badge({ variant = 'default', color, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-[3px] text-[10.5px] font-semibold leading-none whitespace-nowrap border',
        !color && variantStyles[variant],
        className,
      )}
      style={
        color
          ? {
              backgroundColor: `${color}15`,
              color,
              borderColor: `${color}25`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
