import { useEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Activity, Zap, PiggyBank, Database, Cpu, Radio, FileEdit, Bot, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useProjectAnalytics, type AnalyticsRange, type DateUsage } from '../../api/hooks/use-analytics';
import { getToken } from '../../api/client';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '1h', label: '1h' }, { value: '24h', label: '24h' }, { value: '7d', label: '7d' },
  { value: '30d', label: '30d' }, { value: 'all', label: 'All' },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
function money(n: number): string { return n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`; }

// ── live project-event feed (SSE) ─────────────────────────────────────────────
interface FeedItem { id: number; ts: number; text: string; tone: 'info' | 'good' | 'warn' | 'agent' | 'file' }
function useProjectFeed(projectId: string) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);
  const idRef = useRef(0);
  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource(`/api/events/project/${projectId}?token=${encodeURIComponent(getToken() ?? '')}`);
    const push = (text: string, tone: FeedItem['tone']) =>
      setItems((prev) => [{ id: idRef.current++, ts: Date.now(), text, tone }, ...prev].slice(0, 60));
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as { type?: string; [k: string]: unknown };
        const t = d.type ?? 'event';
        const q = (d.query as string) ?? (d.title as string) ?? '';
        if (t === 'agent:started') push(`agent started${q ? `: ${q}` : ''}`, 'agent');
        else if (t === 'agent:completed') push('agent finished', 'good');
        else if (t === 'task:started') push(`task started: ${q}`, 'info');
        else if (t === 'task:completed') push(`task completed: ${q}`, 'good');
        else if (t === 'task:failed') push(`task failed: ${q}`, 'warn');
        else if (t === 'file:changed') push(`file changed: ${(d.filePath as string) ?? ''}`, 'file');
        else if (t === 'run:completed') push('run completed', 'good');
        else if (t === 'run:failed') push('run failed', 'warn');
        else if (t === 'tokens:updated') { /* noisy — skip */ }
        else push(t, 'info');
      } catch { /* keep-alive */ }
    };
    return () => es.close();
  }, [projectId]);
  return { items, live };
}

function useCountUp(target: number, ms = 700) {
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

const SURFACE: React.CSSProperties = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' };
const LABEL: React.CSSProperties = { fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' };

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ ...SURFACE, flex: 1, minWidth: 168, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      <div className="flex items-center gap-2" style={LABEL}><span style={{ color: accent }}>{icon}</span>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Gauge({ pct, label, accent, center }: { pct: number; label: string; accent: string; center: string }) {
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

function Bars({ items, fmtVal }: { items: { label: string; value: number; color: string }[]; fmtVal: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: 92, color: 'var(--color-text-secondary)', flexShrink: 0 }} className="truncate">{it.label}</span>
          <div style={{ flex: 1, height: 8, background: 'var(--color-bg-base)', borderRadius: 2 }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.color, opacity: 0.8, borderRadius: 2 }} />
          </div>
          <span style={{ width: 72, textAlign: 'right', color: 'var(--color-text-disabled)', flexShrink: 0 }}>{fmtVal(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

function DailyBars({ data }: { data: DateUsage[] }) {
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

const toneColor: Record<FeedItem['tone'], string> = { info: 'var(--color-text-tertiary)', good: 'var(--color-success)', warn: 'var(--color-warning)', agent: 'var(--color-accent)', file: 'var(--color-info)' };
function feedIcon(tone: FeedItem['tone']) {
  const s = { width: 13, height: 13 } as const;
  if (tone === 'agent') return <Bot style={s} />;
  if (tone === 'good') return <CheckCircle2 style={s} />;
  if (tone === 'warn') return <AlertTriangle style={s} />;
  if (tone === 'file') return <FileEdit style={s} />;
  return <Radio style={s} />;
}

export function ProjectMonitorPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [range, setRange] = useState<AnalyticsRange>('24h');
  const { data: a, isFetching } = useProjectAnalytics(projectId, { range });
  const feed = useProjectFeed(projectId);

  const spend = useCountUp(a?.totalCostUsd ?? 0);
  const saved = useCountUp(a?.totalSavedUsd ?? 0);
  const tokens = useCountUp((a?.totalInputTokens ?? 0) + (a?.totalOutputTokens ?? 0));
  const cacheRate = a?.cache.hitRate ?? 0;
  const savedPct = a?.savedPct ?? 0;
  const tiers = a?.routerTiers ?? {};
  const tierTotal = Object.values(tiers).reduce((x, y) => x + y, 0) || 1;
  const tierColors: Record<string, string> = { TRIVIAL: '#5a9e78', SIMPLE: '#8fafd4', COMPLEX: '#c9974a', NONE: '#363d4f' };
  const maxAgent = Math.max(...(a?.byAgent ?? []).map((x) => x.inputTokens + x.outputTokens), 1);

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 1100, paddingBottom: 28 }}>
      {/* Header + range + live badge */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <Activity style={{ width: 18, height: 18, color: 'var(--color-accent)' }} /> Mission Control
          </h1>
          <p style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginTop: 3 }}>live activity + usage & cost</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => {
            const on = range === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setRange(r.value)}
                style={{ height: 28, padding: '0 11px', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                  background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                {r.label}
              </button>
            );
          })}
          {isFetching && <Loader2 className="animate-spin" style={{ width: 13, height: 13, color: 'var(--color-text-disabled)' }} />}
          <span className="flex items-center gap-1.5" style={{ marginLeft: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: feed.live ? 'var(--color-success)' : 'var(--color-text-disabled)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: feed.live ? 'var(--color-success)' : 'var(--color-text-disabled)', animation: feed.live ? 'agentPulse 2s ease-in-out infinite' : 'none' }} />
            {feed.live ? 'LIVE' : 'connecting…'}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <Kpi icon={<Zap style={{ width: 13, height: 13 }} />} label="Spend" value={`$${spend.toFixed(4)}`} sub={`${a?.totalRuns ?? 0} runs`} accent="var(--color-accent)" />
        <Kpi icon={<PiggyBank style={{ width: 13, height: 13 }} />} label="Saved" value={`$${saved.toFixed(4)}`} sub={`${savedPct.toFixed(1)}% off baseline`} accent="var(--color-success)" />
        <Kpi icon={<Database style={{ width: 13, height: 13 }} />} label="Tokens" value={fmt(tokens)} sub={`${fmt(a?.compressionSavedTokens ?? 0)} trimmed (L0)`} accent="var(--color-info)" />
        <Kpi icon={<Cpu style={{ width: 13, height: 13 }} />} label="Cache" value={`${cacheRate.toFixed(0)}%`} sub={`${a?.cache.hits ?? 0}/${a?.cache.total ?? 0} hits`} accent="var(--color-warning)" />
      </div>

      {/* Gauges + savings by layer + router tiers */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <div className="flex items-center" style={{ ...SURFACE, gap: 24, flex: 1, minWidth: 250, padding: '16px 18px' }}>
          <Gauge pct={cacheRate} center={`${cacheRate.toFixed(0)}%`} label="L1 cache hit" accent="var(--color-warning)" />
          <Gauge pct={savedPct} center={`${savedPct.toFixed(0)}%`} label="cost saved" accent="var(--color-success)" />
        </div>
        <div style={{ ...SURFACE, flex: 1.2, minWidth: 280, padding: '14px 16px' }}>
          <div style={LABEL}>Savings by layer</div>
          <div style={{ marginTop: 12 }}>
            <Bars fmtVal={money} items={[
              { label: 'L0 compress', value: a?.savingsByLayer.compression ?? 0, color: 'var(--color-warning)' },
              { label: 'L1 cache', value: a?.savingsByLayer.semanticCache ?? 0, color: 'var(--color-success)' },
              { label: 'L2 router', value: a?.savingsByLayer.router ?? 0, color: 'var(--color-accent)' },
              { label: 'L3 prompt', value: a?.savingsByLayer.promptCache ?? 0, color: 'var(--color-agent-documentation)' },
            ]} />
          </div>
        </div>
        <div style={{ ...SURFACE, flex: 1, minWidth: 240, padding: '14px 16px' }}>
          <div style={LABEL}>Router tiers (L2)</div>
          <div className="flex" style={{ height: 10, borderRadius: 5, overflow: 'hidden', margin: '12px 0 10px' }}>
            {Object.entries(tiers).map(([k, v]) => <div key={k} title={`${k}: ${v}`} style={{ width: `${(v / tierTotal) * 100}%`, background: tierColors[k] ?? 'var(--color-accent-muted)' }} />)}
            {Object.keys(tiers).length === 0 && <div style={{ width: '100%', background: 'var(--color-bg-raised)' }} />}
          </div>
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {Object.entries(tiers).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: tierColors[k] ?? 'var(--color-accent-muted)' }} />{k.toLowerCase()} {v}
              </span>
            ))}
            {Object.keys(tiers).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>no routed calls</span>}
          </div>
        </div>
      </div>

      {/* Live feed + recent calls */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <div className="flex flex-col" style={{ ...SURFACE, flex: 1, minWidth: 320, maxHeight: 300 }}>
          <div style={{ ...LABEL, padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>Live stream</div>
          <div className="flex-1 overflow-y-auto" style={{ padding: '6px 0' }}>
            {feed.items.length === 0 && <div style={{ padding: 14, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Waiting for activity… start a run or chat.</div>}
            {feed.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2.5" style={{ padding: '5px 14px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: toneColor[it.tone], flexShrink: 0 }}>{feedIcon(it.tone)}</span>
                <span className="truncate" style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{it.text}</span>
                <span style={{ color: 'var(--color-text-disabled)', fontSize: 10, flexShrink: 0 }}>{new Date(it.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col" style={{ ...SURFACE, flex: 1, minWidth: 320, maxHeight: 300 }}>
          <div style={{ ...LABEL, padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>Recent calls</div>
          <div className="flex-1 overflow-y-auto">
            {(a?.recentCalls ?? []).length === 0 && <div style={{ padding: 14, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No calls yet.</div>}
            {(a?.recentCalls ?? []).map((c, i) => (
              <div key={i} className="flex items-center gap-2" style={{ padding: '6px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.agentColor, flexShrink: 0 }} />
                <span className="truncate" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', flex: 1 }}>{c.model}</span>
                {c.cacheHit && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-subtle)', padding: '0 4px', borderRadius: 3 }}>cache</span>}
                {c.routerTier && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{c.routerTier.toLowerCase()}</span>}
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{money(c.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By agent + by model */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <div style={{ ...SURFACE, flex: 1, minWidth: 320, padding: '14px 16px' }}>
          <div style={LABEL}>By agent</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 12 }}>
            {(a?.byAgent ?? []).length === 0 && <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No run data yet.</span>}
            {(a?.byAgent ?? []).map((ag) => {
              const total = ag.inputTokens + ag.outputTokens;
              return (
                <div key={ag.agentId}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span className="flex items-center gap-2" style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ag.agentColor }} />{ag.agentName}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{money(ag.costUsd)} · {ag.runCount} run{ag.runCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(total / maxAgent) * 100}%`, height: '100%', background: ag.agentColor, opacity: 0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ ...SURFACE, flex: 1, minWidth: 320, padding: '14px 16px' }}>
          <div style={LABEL}>By model</div>
          <div className="flex flex-col" style={{ gap: 1, marginTop: 12 }}>
            {(a?.byModel ?? []).length === 0 && <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No model data yet.</span>}
            {(a?.byModel ?? []).map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-3" style={{ padding: '7px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{m.model}</div>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{m.calls} call{m.calls !== 1 ? 's' : ''} · {fmt(m.inputTokens + m.outputTokens)} tok</span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{money(m.costUsd)}</div>
                  {m.savedUsd > 0 && <div style={{ fontSize: 10, color: 'var(--color-success)' }}>saved {money(m.savedUsd)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily trend + token mix */}
      <div className="flex flex-wrap" style={{ gap: 12 }}>
        <div style={{ ...SURFACE, flex: 1.3, minWidth: 320, padding: '14px 16px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <span style={LABEL}>Over time</span>
            <span className="flex items-center gap-3" style={{ fontSize: 9, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: 'var(--color-accent)', opacity: 0.7 }} />input</span>
              <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: 'var(--color-accent-muted)', opacity: 0.45 }} />output</span>
            </span>
          </div>
          <DailyBars data={a?.byDate ?? []} />
        </div>
        <div style={{ ...SURFACE, flex: 1, minWidth: 280, padding: '14px 16px' }}>
          <div style={LABEL}>Token mix</div>
          <div style={{ marginTop: 12 }}>
            <Bars fmtVal={fmt} items={[
              { label: 'input', value: a?.tokenMix.input ?? 0, color: 'var(--color-accent)' },
              { label: 'output', value: a?.tokenMix.output ?? 0, color: 'var(--color-warning)' },
              { label: 'cache read', value: a?.tokenMix.cacheRead ?? 0, color: 'var(--color-success)' },
              { label: 'cache write', value: a?.tokenMix.cacheCreation ?? 0, color: 'var(--color-agent-documentation)' },
            ]} />
            <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 8 }}>cache-read tokens are billed at ~10% — more reads = more savings</div>
          </div>
        </div>
      </div>
    </div>
  );
}
