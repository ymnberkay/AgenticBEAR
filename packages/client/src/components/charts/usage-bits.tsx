import { useEffect, useRef, useState } from 'react';
import type { DateUsage } from '../../api/hooks/use-analytics';

/** Shared building blocks for the usage/monitor dashboards (KPI cards, gauges, bars, trend). */

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
export function money(n: number): string {
  return n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`;
}

/** Ease-out count-up for headline numbers. */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setV(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export const SURFACE: React.CSSProperties = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' };
export const LABEL: React.CSSProperties = { fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' };

export function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ ...SURFACE, flex: 1, minWidth: 158, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      <div className="flex items-center gap-2" style={LABEL}><span style={{ color: accent }}>{icon}</span>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Gauge({ pct, label, accent, center }: { pct: number; label: string; accent: string; center: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-3">
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: `conic-gradient(${accent} ${p * 3.6}deg, var(--color-bg-raised) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{center}</div>
      </div>
      <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

export function Bars({ items, fmtVal }: { items: { label: string; value: number; color: string }[]; fmtVal: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No data.</span>}
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: 100, color: 'var(--color-text-secondary)', flexShrink: 0 }} className="truncate" title={it.label}>{it.label}</span>
          <div style={{ flex: 1, height: 8, background: 'var(--color-bg-base)', borderRadius: 2 }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.color, opacity: 0.8, borderRadius: 2 }} />
          </div>
          <span style={{ width: 72, textAlign: 'right', color: 'var(--color-text-disabled)', flexShrink: 0 }}>{fmtVal(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DailyBars({ data }: { data: DateUsage[] }) {
  if (data.length === 0) return <p style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No activity in range.</p>;
  const max = Math.max(...data.map((d) => d.inputTokens + d.outputTokens), 1);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 72 }}>
        {data.map((d) => {
          const total = d.inputTokens + d.outputTokens;
          const inPct = total > 0 ? (d.inputTokens / total) * 100 : 50;
          return (
            <div key={d.date} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }} title={`${d.date} · ${fmt(total)} tok · $${d.costUsd.toFixed(4)}`}>
              <div style={{ width: '100%', height: `${(total / max) * 100}%`, minHeight: total > 0 ? 2 : 0, display: 'flex', flexDirection: 'column', borderRadius: '2px 2px 0 0', overflow: 'hidden' }}>
                <div style={{ flex: inPct, background: 'var(--color-accent)', opacity: 0.7 }} />
                <div style={{ flex: 100 - inPct, background: 'var(--color-accent-muted)', opacity: 0.45 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between" style={{ fontSize: 9, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        <span>{data[0]?.date.slice(5)}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>}
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
