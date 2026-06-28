import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, LogOut, ChevronDown } from 'lucide-react';
import { useMe, logout } from '../../api/hooks/use-auth';

const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)',
  contributor: 'var(--color-success)',
  viewer: 'var(--color-text-tertiary)',
};

/** Top-right account menu: avatar → dropdown with the signed-in user, Settings, and Logout. */
export function UserMenu() {
  const me = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const user = me.data;
  const name = user?.username ?? '—';
  const role = user?.role ?? '';
  const initial = name.charAt(0).toUpperCase();
  const rc = roleColor[role] ?? 'var(--color-text-tertiary)';

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={name}
        className="flex items-center gap-2 transition-all duration-150"
        style={{
          height: 34, padding: '0 8px 0 6px', borderRadius: 'var(--radius-md)',
          background: open ? 'var(--color-bg-raised)' : 'transparent',
          border: `1px solid ${open ? 'var(--color-border-default)' : 'transparent'}`, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}>
        <span className="flex items-center justify-center" style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.35)',
          color: 'var(--color-accent)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
        }}>{initial}</span>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <ChevronDown style={{ width: 13, height: 13, color: 'var(--color-text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute"
            style={{
              top: 'calc(100% + 8px)', right: 0, width: 220, zIndex: 60,
              background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            }}
          >
            {/* User header */}
            <div className="flex items-center gap-2.5" style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.35)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{initial}</span>
              <div style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</div>
                <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: rc, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{role}</div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: 5 }}>
              <button type="button" onClick={() => { setOpen(false); navigate({ to: '/settings' }); }}
                className="flex items-center gap-2.5 w-full transition-colors duration-150"
                style={{ height: 34, padding: '0 10px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-raised)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>
                <Settings style={{ width: 15, height: 15 }} /> Settings
              </button>
              <button type="button" onClick={logout}
                className="flex items-center gap-2.5 w-full transition-colors duration-150"
                style={{ height: 34, padding: '0 10px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-error-subtle)'; e.currentTarget.style.color = 'var(--color-error)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>
                <LogOut style={{ width: 15, height: 15 }} /> Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
