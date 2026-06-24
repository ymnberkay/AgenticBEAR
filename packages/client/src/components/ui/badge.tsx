import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  color?: string;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--color-bg-raised)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' },
  success: { background: 'var(--color-success-subtle)', color: 'var(--color-success)', border: '1px solid rgba(109,181,138,0.25)' },
  warning: { background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', border: '1px solid rgba(226,176,74,0.25)' },
  error:   { background: 'var(--color-error-subtle)',   color: 'var(--color-error)',   border: '1px solid rgba(224,96,96,0.25)' },
  info:    { background: 'var(--color-accent-subtle)',  color: 'var(--color-accent)',  border: '1px solid rgba(124,140,248,0.25)' },
};

export function Badge({ variant = 'default', color, children, className }: BadgeProps) {
  const style: React.CSSProperties = color
    ? { background: `${color}15`, color, border: `1px solid ${color}30` }
    : variantStyles[variant];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
        borderRadius: 'var(--radius-sm)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
