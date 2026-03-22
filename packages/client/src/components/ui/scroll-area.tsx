import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  maxHeight?: string;
}

export function ScrollArea({ children, maxHeight, className, style, ...props }: ScrollAreaProps) {
  return (
    <div
      className={cn(
        'overflow-auto',
        '[&::-webkit-scrollbar]:w-1.5',
        '[&::-webkit-scrollbar-track]:bg-transparent',
        '[&::-webkit-scrollbar-thumb]:bg-border-default',
        '[&::-webkit-scrollbar-thumb]:rounded-full',
        '[&::-webkit-scrollbar-thumb:hover]:bg-text-disabled',
        className,
      )}
      style={{ maxHeight, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
