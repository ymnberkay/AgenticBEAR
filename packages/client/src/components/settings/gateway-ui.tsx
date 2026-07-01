import type { ReactNode } from 'react';

/**
 * Modern panel container used across the Gateway tabs (Overview / Providers /
 * API Keys / Models / Usage). A lighter alternative to the Settings `Section`:
 * a small tinted icon badge in the header, no thick coloured left stripe, and
 * a subtle inner-top highlight that reads well over the page's ambient grid.
 */
export function Panel({
  icon,
  title,
  color,
  action,
  children,
  padded = true,
}: {
  icon: ReactNode;
  title: string;
  color: string;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 flex-wrap"
        style={{ padding: '11px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${color}1a`,
              border: `1px solid ${color}55`,
              color,
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>
        {action}
      </div>
      <div style={{ padding: padded ? 16 : 0 }}>{children}</div>
    </section>
  );
}
