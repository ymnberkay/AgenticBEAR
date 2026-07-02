import { ShieldAlert } from 'lucide-react';

/**
 * Full-page "admin only" notice for org-management areas (Settings, Gateway). The backend enforces
 * this too (rbacHook) — this is the matching UX so non-admins get a clear message, not failed calls.
 */
export function AdminRequired({ area }: { area: string }) {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--color-bg-base)', padding: 32 }}>
      <div
        className="flex flex-col items-center text-center"
        style={{
          maxWidth: 420, gap: 12, padding: '32px 28px',
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <span
          aria-hidden="true"
          className="flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
        >
          <ShieldAlert style={{ width: 18, height: 18 }} />
        </span>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Admin access required</h1>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
          {area} is limited to administrators. Ask an admin if you need access or changes here.
        </p>
      </div>
    </div>
  );
}
