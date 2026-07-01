import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DateUsage } from '../../api/hooks/use-analytics';

/** Shared building blocks for the usage/monitor dashboards (KPI cards, gauges, bars, trend). */

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
export function money(n: number): string {
  if (n === 0) return '$0.00';
  const abs = Math.abs(n);
  if (abs >= 100) return `$${n.toFixed(0)}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

/** Ease-out count-up for headline numbers. Avoids re-animating on refetch with same target. */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const lastTarget = useRef(target);
  useEffect(() => {
    if (Math.abs(target - lastTarget.current) < 1e-7) {
      setV(target);
      return;
    }
    lastTarget.current = target;
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
export const LABEL: React.CSSProperties = { fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' };

export function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ ...SURFACE, flex: 1, minWidth: 158, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      <div className="flex items-center gap-2" style={LABEL}><span style={{ color: accent }} aria-hidden="true">{icon}</span>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Gauge({ pct, label, accent, center }: { pct: number; label: string; accent: string; center: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={`${label}: ${pct.toFixed(0)} percent`}
        style={{ width: 60, height: 60, borderRadius: '50%', background: `conic-gradient(${accent} ${p * 3.6}deg, var(--color-bg-raised) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{center}</div>
      </div>
      <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

interface BarItem { label: string; value: number; color: string }

export function Bars({ items, fmtVal }: { items: BarItem[]; fmtVal: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No data.</span>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => {
        const widthPct = (it.value / max) * 100;
        return (
          <BarRow key={it.label} item={it} widthPct={widthPct} fmtVal={fmtVal} />
        );
      })}
    </div>
  );
}

function BarRow({ item, widthPct, fmtVal }: { item: BarItem; widthPct: number; fmtVal: (n: number) => string }) {
  const { ref, tooltip } = useChartTooltip(`${item.label}: ${fmtVal(item.value)}`);
  return (
    <div ref={ref} className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
      <span style={{ width: 100, color: 'var(--color-text-primary)', flexShrink: 0 }} className="truncate" title={item.label}>
        {item.label}
      </span>
      <div
        role="img"
        aria-label={`${item.label}: ${fmtVal(item.value)}`}
        style={{ flex: 1, height: 8, background: 'var(--color-bg-base)', borderRadius: 2 }}
      >
        <div style={{ width: `${widthPct}%`, height: '100%', background: item.color, opacity: 0.85, borderRadius: 2 }} />
      </div>
      <span style={{ width: 72, textAlign: 'right', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{fmtVal(item.value)}</span>
      {tooltip}
    </div>
  );
}

export function DailyBars({ data }: { data: DateUsage[] }) {
  if (data.length === 0) {
    return <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No activity in range.</p>;
  }
  const max = Math.max(...data.map((d) => d.inputTokens + d.outputTokens), 1);
  const idBase = useId();
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 72 }} role="img" aria-label="Daily token usage">
        {data.map((d, i) => {
          const total = d.inputTokens + d.outputTokens;
          const inPct = total > 0 ? (d.inputTokens / total) * 100 : 50;
          return (
            <DailyBar
              key={`${idBase}-${i}-${d.date}`}
              date={d.date}
              total={total}
              cost={d.costUsd}
              maxTotal={max}
              inPercent={inPct}
            />
          );
        })}
      </div>
      <div className="flex justify-between" style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        <span>{data[0]?.date.slice(5)}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>}
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DailyBar({ date, total, cost, maxTotal, inPercent }: { date: string; total: number; cost: number; maxTotal: number; inPercent: number }) {
  const { ref, tooltip } = useChartTooltip(`${date} · ${fmt(total)} tokens · ${money(cost)}`);
  return (
    <div
      ref={ref}
      className="flex-1 flex flex-col justify-end"
      style={{ height: '100%' }}
      aria-label={`${date}: ${fmt(total)} tokens`}
      tabIndex={0}
    >
      <div style={{ width: '100%', height: `${(total / maxTotal) * 100}%`, minHeight: total > 0 ? 2 : 0, display: 'flex', flexDirection: 'column', borderRadius: '2px 2px 0 0', overflow: 'hidden' }}>
        <div style={{ flex: inPercent, background: 'var(--color-accent)', opacity: 0.75 }} />
        <div style={{ flex: 100 - inPercent, background: 'var(--color-accent-muted)', opacity: 0.5 }} />
      </div>
      {tooltip}
    </div>
  );
}

/**
 * Daily bar chart specialized for request counts (not tokens). Splits each bar into
 * `cache hit` (bottom, green) vs `provider call` (top, amber) so the chart tells you at a
 * glance how many API calls came in AND how many were served from cache.
 */
export interface DailyRequestPoint { date: string; requests: number; cacheHits?: number }
export function DailyRequestBars({ data, accent = '#e2b04a', cacheAccent = '#22c55e' }: { data: DailyRequestPoint[]; accent?: string; cacheAccent?: string }) {
  if (data.length === 0) {
    return <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No requests in range.</p>;
  }
  const max = Math.max(...data.map((d) => d.requests), 1);
  const idBase = useId();
  const total = data.reduce((s, d) => s + d.requests, 0);
  const totalHits = data.reduce((s, d) => s + (d.cacheHits ?? 0), 0);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 84 }} role="img" aria-label="Daily API requests">
        {data.map((d, i) => (
          <DailyRequestBar
            key={`${idBase}-${i}-${d.date}`}
            date={d.date}
            requests={d.requests}
            cacheHits={d.cacheHits ?? 0}
            maxRequests={max}
            accent={accent}
            cacheAccent={cacheAccent}
          />
        ))}
      </div>
      <div className="flex justify-between items-center" style={{ fontSize: 9, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
        <span>{data[0]?.date.slice(5)}</span>
        <span className="flex items-center gap-3" style={{ fontSize: 9.5 }}>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: cacheAccent, opacity: 0.85 }} />
            {fmt(totalHits)} cached
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: accent, opacity: 0.85 }} />
            {fmt(total - totalHits)} live
          </span>
        </span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function DailyRequestBar({ date, requests, cacheHits, maxRequests, accent, cacheAccent }: { date: string; requests: number; cacheHits: number; maxRequests: number; accent: string; cacheAccent: string }) {
  const live = Math.max(0, requests - cacheHits);
  const cachePct = requests > 0 ? (cacheHits / requests) * 100 : 0;
  const { ref, tooltip } = useChartTooltip(`${date} · ${fmt(requests)} req · ${fmt(cacheHits)} cache · ${fmt(live)} live`);
  return (
    <div
      ref={ref}
      className="flex-1 flex flex-col justify-end"
      style={{ height: '100%' }}
      aria-label={`${date}: ${fmt(requests)} requests, ${fmt(cacheHits)} cache hits`}
      tabIndex={0}
    >
      <div style={{ width: '100%', height: `${(requests / maxRequests) * 100}%`, minHeight: requests > 0 ? 2 : 0, display: 'flex', flexDirection: 'column', borderRadius: '2px 2px 0 0', overflow: 'hidden' }}>
        {/* Top segment: live provider calls */}
        <div style={{ flex: 100 - cachePct, background: accent, opacity: 0.85 }} />
        {/* Bottom segment: cache hits (green anchor at the baseline) */}
        <div style={{ flex: cachePct, background: cacheAccent, opacity: 0.85 }} />
      </div>
      {tooltip}
    </div>
  );
}

/** Lightweight portal-based tooltip used by chart elements (hover + focus). */
function useChartTooltip(content: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    // Reposition if close to viewport edges.
    const tipWidth = 180;
    const tipHeight = 28;
    let { left, top } = pos;
    if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - tipWidth - 8;
    if (top + tipHeight > window.innerHeight - 8) top = pos.top - tipHeight - 12;
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
  }, [pos]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onEnter = (e: MouseEvent | FocusEvent) => {
      const target = e.currentTarget as HTMLElement;
      const r = target.getBoundingClientRect();
      setPos({ left: r.left + r.width / 2 - 90, top: r.top - 32 });
    };
    const onLeave = () => setPos(null);
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focus', onEnter);
    el.addEventListener('blur', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focus', onEnter);
      el.removeEventListener('blur', onLeave);
    };
  }, []);

  const tooltip = pos
    ? createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
            padding: '4px 8px',
            background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap',
            pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
          }}
        >
          {content}
        </div>,
        document.body,
      )
    : null;

  return { ref, tooltip };
}
