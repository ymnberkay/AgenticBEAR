import type { ReactNode, HTMLAttributes, KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  hoverable?: boolean;
  children: ReactNode;
}

export function Card({ header, footer, hoverable = false, children, className, onClick, onKeyDown, ...props }: CardProps) {
  const interactive = hoverable && typeof onClick === 'function';

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
    }
    onKeyDown?.(e);
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'transition-all duration-150',
        hoverable && 'cursor-pointer',
        interactive && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]',
        className,
      )}
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: '3px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
      onMouseEnter={hoverable ? (e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.borderLeftColor = '#7c8cf8';
        e.currentTarget.style.background = 'var(--color-bg-raised)';
      } : undefined}
      onMouseLeave={hoverable ? (e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.borderLeftColor = 'var(--color-border-subtle)';
        e.currentTarget.style.background = 'var(--color-bg-surface)';
      } : undefined}
      onFocus={interactive ? (e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.borderLeftColor = '#7c8cf8';
      } : undefined}
      onBlur={interactive ? (e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.borderLeftColor = 'var(--color-border-subtle)';
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
    <p className={cn('text-[12px] leading-snug text-text-secondary mt-1.5', className)}
       style={{ fontFamily: 'var(--font-sans)' }}>
      {children}
    </p>
  );
}
