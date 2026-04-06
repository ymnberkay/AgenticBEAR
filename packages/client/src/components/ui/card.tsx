import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  hoverable?: boolean;
  children: ReactNode;
}

export function Card({ header, footer, hoverable = false, children, className, ...props }: CardProps) {
  return (
    <div
      className={cn('transition-all duration-150', hoverable && 'cursor-pointer', className)}
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: '3px solid var(--color-border-subtle)',
      }}
      onMouseEnter={hoverable ? (e) => {
        e.currentTarget.style.borderLeftColor = '#fabd2f';
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.borderLeftColor = '#fabd2f';
        e.currentTarget.style.background = 'var(--color-bg-raised)';
      } : undefined}
      onMouseLeave={hoverable ? (e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.borderLeftColor = 'var(--color-border-subtle)';
        e.currentTarget.style.background = 'var(--color-bg-surface)';
      } : undefined}
      {...props}
    >
      {header && (
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
          {header}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[14px] leading-tight font-semibold text-text-primary', className)}
        style={{ fontFamily: 'var(--font-sans)' }}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[12px] leading-snug text-text-tertiary mt-1.5', className)}
       style={{ fontFamily: 'var(--font-sans)' }}>
      {children}
    </p>
  );
}
