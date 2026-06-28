/** Shared building blocks for the Settings tabs (boxed section, inputs, pager, money fmt). */
import type { ReactNode, CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%', height: 36, padding: '0 12px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', borderRadius: 'var(--radius-md)',
};

export function Section({
  icon, color, title, action, children,
}: { icon: ReactNode; color: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: `3px solid ${color}`, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <span style={{ color, display: 'flex' }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

export const money = (n: number) => (Math.abs(n) < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`);

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

/** A labelled metric (uppercase mono label + big mono value). */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 84 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color ?? 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

const selectStyle: CSSProperties = {
  ...inputStyle, height: 30, width: 'auto', minWidth: 130, cursor: 'pointer', fontSize: 12,
};

/** A small labelled dropdown used by the Usage filters. */
export function FilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export const PAGE_SIZE = 10;

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  const btn = (enabled: boolean): CSSProperties => ({
    background: 'none', border: 'none', padding: 0,
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#7c8cf8' : 'var(--color-border-default)',
  });
  return (
    <div className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} style={btn(page > 1)}>‹ prev</button>
      <span>page {page} / {total}</span>
      <button type="button" disabled={page >= total} onClick={() => onPage(page + 1)} style={btn(page < total)}>next ›</button>
    </div>
  );
}
