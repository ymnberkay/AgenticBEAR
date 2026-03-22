import { useState, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface TooltipProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 400,
  className,
  ...props
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    const id = setTimeout(() => setVisible(true), delay);
    setTimeoutId(id);
  };

  const hide = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setVisible(false);
  };

  const positionStyles: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  };

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      {...props}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-[60] rounded bg-[#252526] border border-[#333333] px-2 py-1 text-[10px] text-[#cccccc] whitespace-nowrap pointer-events-none shadow-md',
            positionStyles[side],
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
