import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastState {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
}

// ─────────────────────────── module-level singleton store ──────────────────────────
let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return items;
}

function showToast(
  message: string,
  opts?: { variant?: ToastVariant; duration?: number },
): number {
  const variant: ToastVariant = opts?.variant ?? 'success';
  const baseMs = variant === 'error' ? 5000 : 3000;
  const duration = opts?.duration ?? Math.min(8000, baseMs + Math.max(0, message.length - 40) * 30);
  const id = nextId++;
  items = [...items, { id, message, variant, duration }];
  emit();
  return id;
}

function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

// ─────────────────────────── public hook ──────────────────────────
export function useToast() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const last = toasts[toasts.length - 1];
  const toast: ToastState = last
    ? { visible: true, message: last.message, variant: last.variant }
    : { visible: false, message: '' };

  return { show: showToast, dismiss: dismissToast, toast, toasts };
}

// ─────────────────────────── presentation ──────────────────────────
const VARIANT_STYLES: Record<ToastVariant, { color: string; border: string; Icon: React.ComponentType<{ style?: React.CSSProperties }> }> = {
  success: { color: '#6db58a', border: '#6db58a', Icon: CheckCircle },
  error:   { color: '#e06060', border: '#e06060', Icon: AlertCircle },
  info:    { color: '#7c8cf8', border: '#7c8cf8', Icon: Info },
};

/**
 * Legacy single-toast renderer. Kept for backwards compatibility with the older
 * `useToast().toast` pattern. Prefer mounting `<ToastViewport />` once in AppShell
 * and calling `useToast().show()` from anywhere — this renderer becomes a no-op
 * when the viewport is mounted, but is safe to leave in place.
 */
export function Toast(_props: { toast: ToastState; onDismiss?: () => void }) {
  return null;
}

export function ToastViewport({
  toasts: explicitToasts,
  onDismiss,
}: {
  toasts?: ToastItem[];
  onDismiss?: (id: number) => void;
}) {
  const subscribed = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toasts = explicitToasts ?? subscribed;
  const handleDismiss = onDismiss ?? dismissToast;

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: `max(24px, env(safe-area-inset-bottom))`,
        right: `max(24px, env(safe-area-inset-right))`,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 'min(360px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} onDismiss={() => handleDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { Icon, color, border } = VARIANT_STYLES[item.variant];
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const t = setTimeout(onDismiss, remainingRef.current);
    return () => {
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
      clearTimeout(t);
    };
  }, [paused, onDismiss]);

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px 10px 14px',
        background: 'var(--color-bg-surface)',
        border: '1px solid rgba(124,140,248,0.3)',
        borderLeft: `3px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color,
        pointerEvents: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        animation: 'fadeInUp 180ms ease-out',
      }}
    >
      <Icon style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>{item.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          marginLeft: 4,
          color: 'currentColor',
          opacity: 0.65,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          minWidth: 24,
          minHeight: 24,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.65')}
      >
        <X style={{ width: 12, height: 12 }} aria-hidden="true" />
      </button>
    </div>
  );
}
