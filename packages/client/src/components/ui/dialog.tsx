import { type ReactNode, useEffect } from 'react';
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
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  maxWidth = '480px',
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
            onClick={onClose}
          />
          {/* Container — clicking empty area closes the dialog */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              className={cn('w-full flex flex-col', className)}
              style={{
                maxWidth,
                maxHeight: '90vh',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(212,146,78,0.06)',
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
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
                      <h2 className="text-[16px] font-bold text-text-primary tracking-tight">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="mt-1 text-[13px] text-text-tertiary">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 text-text-tertiary hover:bg-white/[0.06] hover:text-text-primary transition-all duration-200 shrink-0 ml-3"
                  >
                    <X className="h-4 w-4" />
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
