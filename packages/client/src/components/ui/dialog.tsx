import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
  /** If true, clicking the backdrop will NOT close the dialog (use for forms with unsaved data). */
  disableBackdropClose?: boolean;
  /** Selector for element to receive initial focus. Defaults to first focusable in dialog. */
  initialFocusSelector?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  maxWidth = '480px',
  disableBackdropClose = false,
  initialFocusSelector,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Focus management: save previously focused element, focus into dialog, restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const node = contentRef.current;
    if (!node) return;
    const t = setTimeout(() => {
      const target = initialFocusSelector
        ? (node.querySelector(initialFocusSelector) as HTMLElement | null)
        : (node.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null);
      (target ?? node).focus();
    }, 30);
    return () => {
      clearTimeout(t);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, initialFocusSelector]);

  // Focus trap on Tab/Shift+Tab.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const node = contentRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownTargetRef.current = e.target;
  };
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (disableBackdropClose) return;
    // Only close if mousedown originated on backdrop too (avoids closing on text-selection drag).
    if (mouseDownTargetRef.current === e.currentTarget && e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(5, 4, 3, 0.8)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden="true"
          />
          {/* Container — clicking empty area closes the dialog */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onMouseDown={handleBackdropMouseDown}
            onClick={handleBackdropClick}
          >
            <motion.div
              ref={contentRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              className={cn('w-full flex flex-col focus:outline-none', className)}
              style={{
                maxWidth,
                maxHeight: '90vh',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(124,140,248,0.06)',
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header (optional) */}
              {(title || description) && (
                <div
                  className="flex items-start justify-between shrink-0"
                  style={{ padding: '20px 40px', borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2 id={titleId} className="text-[16px] font-bold text-text-primary tracking-tight">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p id={descId} className="mt-1 text-[13px] text-text-tertiary">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="p-1.5 text-text-tertiary hover:bg-white/[0.06] hover:text-text-primary transition-all duration-200 shrink-0 ml-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
                    style={{ minWidth: 32, minHeight: 32 }}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              {/* Scrollable content area */}
              <div
                className="overflow-y-auto flex-1 min-h-0"
                style={{ padding: '24px 40px' }}
              >
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
