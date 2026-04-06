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

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-[30px] px-3 text-[12px] gap-1.5',
  md: 'h-[36px] px-4 text-[13px] gap-2',
  lg: 'h-[40px] px-5 text-[14px] gap-2',
};

const variantBase: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: '#fabd2f', color: '#1d2021', border: 'none', fontWeight: 600 },
  default: { background: 'var(--color-bg-raised)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' },
  ghost:   { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' },
  outline: { background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' },
  danger:  { background: 'rgba(251, 73, 52, 0.10)', color: '#fb4934', border: '1px solid rgba(251, 73, 52, 0.25)' },
};

const variantHover: Record<ButtonVariant, Partial<React.CSSProperties>> = {
  primary: { background: '#ffd561' },
  default: { background: 'var(--color-bg-overlay)', borderColor: 'var(--color-border-default)' },
  ghost:   { background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)' },
  outline: { background: 'var(--color-bg-raised)' },
  danger:  { background: 'rgba(251, 73, 52, 0.18)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', loading = false, icon, disabled, className, children, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 whitespace-nowrap leading-none select-none',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#fabd2f]',
          'disabled:opacity-40 disabled:pointer-events-none',
          sizeStyles[size],
          className,
        )}
        style={{ fontFamily: 'var(--font-sans)', ...variantBase[variant], ...style }}
        onMouseEnter={(e) => {
          Object.assign(e.currentTarget.style, variantHover[variant]);
          props.onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          Object.assign(e.currentTarget.style, variantBase[variant]);
          props.onMouseLeave?.(e);
        }}
        {...props}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon ? <span className="shrink-0">{icon}</span> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
