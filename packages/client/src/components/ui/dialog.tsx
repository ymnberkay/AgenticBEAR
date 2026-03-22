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
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className={cn('w-full shadow-2xl overflow-hidden', className)}
              style={{
                maxWidth,
                background: 'var(--color-bg-surface)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
              }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              {(title || description) && (
                <div
                  className="flex items-start justify-between px-6 py-5"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2 className="text-[16px] font-bold text-text-primary">
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
              <div className="px-6 py-5">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
