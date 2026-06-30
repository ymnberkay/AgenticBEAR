import { Settings2 } from 'lucide-react';

/**
 * General settings — intentionally empty for now. The previous model/workspace/performance
 * defaults were removed; per-model limits live in the Models tab, keys in Providers, etc.
 */
export function GeneralTab(_props: { onSaved?: (msg: string) => void } = {}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: 280, padding: '40px 24px' }}
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-center"
        style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--color-accent-subtle)',
          border: '1px solid rgba(124,140,248,0.25)',
          marginBottom: 14,
        }}
      >
        <Settings2 style={{ width: 22, height: 22, color: 'var(--color-accent)' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
        Nothing to configure here yet
      </div>
      <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 6, maxWidth: 380 }}>
        Provider keys live in <b>Providers</b>, per-model limits in <b>Models</b>, and access in <b>Groups</b>.
      </p>
    </div>
  );
}
