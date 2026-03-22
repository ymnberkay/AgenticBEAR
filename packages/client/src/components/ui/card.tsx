import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  hoverable?: boolean;
  children: ReactNode;
}

export function Card({
  header,
  footer,
  hoverable = false,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'transition-all duration-200',
        hoverable && 'hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        ...(hoverable
          ? {}
          : {}),
      }}
      onMouseEnter={
        hoverable
          ? (e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border-hover)';
              e.currentTarget.style.background = 'var(--color-bg-card-hover)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2), 0 0 22px rgba(0, 212, 255, 0.08)';
            }
          : undefined
      }
      onMouseLeave={
        hoverable
          ? (e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.background = 'var(--color-bg-card)';
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
      {...props}
    >
      {header && (
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          {header}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div
          className="px-5 py-4"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[15px] leading-tight font-semibold text-text-primary', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[13px] leading-snug text-text-tertiary mt-1.5', className)}>
      {children}
    </p>
  );
}
