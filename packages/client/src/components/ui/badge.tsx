import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  color?: string;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'rgba(146,131,116,0.12)', color: '#928374', border: '1px solid rgba(146,131,116,0.2)' },
  success: { background: 'rgba(184,187,38,0.10)', color: '#b8bb26', border: '1px solid rgba(184,187,38,0.22)' },
  warning: { background: 'rgba(254,128,25,0.10)', color: '#fe8019', border: '1px solid rgba(254,128,25,0.22)' },
  error:   { background: 'rgba(251,73,52,0.10)',  color: '#fb4934', border: '1px solid rgba(251,73,52,0.22)' },
  info:    { background: 'rgba(131,165,152,0.10)', color: '#83a598', border: '1px solid rgba(131,165,152,0.22)' },
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
        ...style,
      }}
    >
      {children}
    </span>
  );
}
