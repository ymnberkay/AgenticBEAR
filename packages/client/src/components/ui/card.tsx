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
        'rounded-xl transition-all duration-200',
        hoverable && 'hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        ...(hoverable
          ? {}
          : {}),
      }}
      onMouseEnter={
        hoverable
          ? (e) => {
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            }
          : undefined
      }
      onMouseLeave={
        hoverable
          ? (e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
      {...props}
    >
      {header && (
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          {header}
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div
          className="px-5 py-3.5"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[14px] font-semibold text-[#e2e2e8]', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[12.5px] text-[#5a5a6e] mt-1', className)}>
      {children}
    </p>
  );
}
