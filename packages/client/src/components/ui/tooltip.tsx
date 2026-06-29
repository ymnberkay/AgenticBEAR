import { useState, useEffect, useId, useRef, useLayoutEffect, type ReactNode, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
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
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' | 'left' | 'right' }>({ top: 0, left: 0, placement: side });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const tipId = useId();

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const show = () => {
    clearTimer();
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  useEffect(() => () => clearTimer(), []);

  // Position with viewport collision detection.
  useLayoutEffect(() => {
    if (!visible || !wrapperRef.current || !tipRef.current) return;
    const trig = wrapperRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 6;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let placement: 'top' | 'bottom' | 'left' | 'right' = side;
    const fits = {
      top: trig.top - tip.height - margin >= 4,
      bottom: trig.bottom + tip.height + margin <= viewportH - 4,
      left: trig.left - tip.width - margin >= 4,
      right: trig.right + tip.width + margin <= viewportW - 4,
    };
    if (!fits[placement]) {
      const fallback: Record<typeof placement, typeof placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
      if (fits[fallback[placement]]) placement = fallback[placement];
    }

    let top = 0;
    let left = 0;
    switch (placement) {
      case 'top':
        top = trig.top - tip.height - margin;
        left = trig.left + trig.width / 2 - tip.width / 2;
        break;
      case 'bottom':
        top = trig.bottom + margin;
        left = trig.left + trig.width / 2 - tip.width / 2;
        break;
      case 'left':
        top = trig.top + trig.height / 2 - tip.height / 2;
        left = trig.left - tip.width - margin;
        break;
      case 'right':
        top = trig.top + trig.height / 2 - tip.height / 2;
        left = trig.right + margin;
        break;
    }

    // Clamp inside viewport.
    left = Math.max(4, Math.min(viewportW - tip.width - 4, left));
    top = Math.max(4, Math.min(viewportH - tip.height - 4, top));

    setPos({ top, left, placement });
  }, [visible, content, side]);

  return (
    <div
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? tipId : undefined}
      {...props}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="fixed z-[1000] px-2 py-1 text-[12px] text-text-primary whitespace-nowrap pointer-events-none shadow-md"
            style={{
              top: pos.top,
              left: pos.left,
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
