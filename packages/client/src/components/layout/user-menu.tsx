import { useEffect, useRef, useState, useId, type KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, LogOut, ChevronDown } from 'lucide-react';
import { useMe, logout } from '../../api/hooks/use-auth';

const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)',
  contributor: 'var(--color-success)',
  viewer: 'var(--color-text-secondary)',
};

/** Top-right account menu: avatar → dropdown with the signed-in user, Settings, and Logout. */
export function UserMenu() {
  const me = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const items = [
    { id: 'settings', label: 'Settings', icon: Settings, action: () => { setOpen(false); navigate({ to: '/settings' }); } },
    { id: 'logout', label: 'Log out', icon: LogOut, action: () => { setOpen(false); logout(); }, danger: true },
  ];

  useEffect(() => {
    if (!open) return;
    setFocusedIdx(0);
    setTimeout(() => itemRefs.current[0]?.focus(), 0);

    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (focusedIdx + 1) % items.length;
      setFocusedIdx(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (focusedIdx - 1 + items.length) % items.length;
      setFocusedIdx(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIdx(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = items.length - 1;
      setFocusedIdx(last);
      itemRefs.current[last]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const user = me.data;
  const name = user?.username ?? '—';
  const role = user?.role ?? '';
  const initial = name.charAt(0).toUpperCase();
  const rc = roleColor[role] ?? 'var(--color-text-secondary)';

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-label={`Account menu for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex items-center gap-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          height: 40, padding: '0 10px 0 8px', borderRadius: 'var(--radius-md)',
          background: open ? 'var(--color-bg-raised)' : 'transparent',
          border: `1px solid ${open ? 'var(--color-border-default)' : 'transparent'}`,
          cursor: 'pointer', minWidth: 44,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <span aria-hidden="true" className="flex items-center justify-center" style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.35)',
          color: 'var(--color-accent)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
        }}>{initial}</span>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, color: 'var(--color-text-secondary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Account menu"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute"
            style={{
              top: 'calc(100% + 8px)', right: 0, width: 240, zIndex: 60,
              background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            }}
          >
            <div className="flex items-center gap-2.5" role="presentation" style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span aria-hidden="true" className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.35)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{initial}</span>
              <div style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</div>
                <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: rc, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{role}</div>
              </div>
            </div>

            <div style={{ padding: 5 }}>
              {items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    type="button"
                    role="menuitem"
                    tabIndex={focusedIdx === i ? 0 : -1}
                    onClick={item.action}
                    onFocus={() => setFocusedIdx(i)}
                    className="flex items-center gap-2.5 w-full transition-colors duration-150 focus-visible:outline-none"
                    style={{
                      height: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = item.danger ? 'var(--color-error-subtle)' : 'var(--color-bg-raised)';
                      e.currentTarget.style.color = item.danger ? 'var(--color-error)' : 'var(--color-text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none';
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                    }}
                  >
                    <Icon style={{ width: 15, height: 15 }} aria-hidden="true" /> {item.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
