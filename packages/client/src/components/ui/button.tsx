import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-white/[0.05] text-text-primary hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.12]',
  primary:
    'text-white border border-transparent hover:-translate-y-[1px]',
  ghost:
    'bg-transparent text-text-secondary hover:bg-white/[0.05] hover:text-text-primary border border-transparent',
  outline:
    'bg-transparent text-text-primary border border-white/[0.1] hover:bg-white/[0.04] hover:border-white/[0.15]',
  danger:
    'bg-error-subtle text-error border border-transparent hover:bg-error/20',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-[34px] px-3.5 text-[12px] leading-none gap-1.5',
  md: 'h-[40px] px-5 text-[13px] leading-none gap-2',
  lg: 'h-[44px] px-6 text-[14px] leading-none gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'default',
      size = 'md',
      loading = false,
      icon,
      disabled,
      className,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const isPrimary = variant === 'primary';

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200 whitespace-nowrap leading-none select-none overflow-hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base',
          'disabled:opacity-35 disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        style={{
          ...(isPrimary
            ? {
                background: 'var(--gradient-accent)',
                boxShadow: '0 3px 14px var(--color-accent-glow)',
              }
            : {}),
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
