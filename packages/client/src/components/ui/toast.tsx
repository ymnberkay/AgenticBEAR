import { useState, useEffect, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastState {
  visible: boolean;
  message: string;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '' });

  const show = useCallback((message: string) => {
    setToast({ visible: true, message });
  }, []);

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(() => setToast((s) => ({ ...s, visible: false })), 2500);
    return () => clearTimeout(t);
  }, [toast.visible]);

  return { show, toast };
}

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'var(--color-bg-surface)',
        border: '1px solid rgba(110,172,218,0.3)',
        borderLeft: '3px solid #6db58a',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: '#6db58a',
        pointerEvents: 'none',
        transition: 'opacity 0.25s, transform 0.25s',
        opacity: toast.visible ? 1 : 0,
        transform: toast.visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <CheckCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
      {toast.message}
    </div>
  );
}
