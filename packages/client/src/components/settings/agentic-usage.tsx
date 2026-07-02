import { useState } from 'react';
import { Bot, Layers, Route, Users2, TrendingUp } from 'lucide-react';
import { useProjects } from '../../api/hooks/use-projects';
import { useGlobalAnalytics, useProjectAnalytics, type AnalyticsRange, type ProjectAnalytics } from '../../api/hooks/use-analytics';
import { Section, Stat, FilterSelect, money, fmtTokens } from './ui';
import { Bars, DailyBars, fmt } from '../charts/usage-bits';

const TIER_COLOR: Record<string, string> = { TRIVIAL: '#57a986', SIMPLE: '#7c8cf8', COMPLEX: '#e2b04a', '(none)': 'var(--color-text-tertiary)' };
const SUBHEAD: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 };

/** In-app agentic usage (Chat / Start Run) — filterable by project. */
export function AgenticUsage({ range }: { range: AnalyticsRange }) {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState('all');

  // "all" → org-wide project analytics; otherwise the single project's analytics.
  const global = useGlobalAnalytics({ range });
  const single = useProjectAnalytics(projectId === 'all' ? '' : projectId, { range });
  const data: ProjectAnalytics | undefined = projectId === 'all' ? global.data : single.data;

  const layerRows = [
    { label: 'L0 compression', value: data?.savingsByLayer.compression ?? 0, color: '#e2b04a' },
    { label: 'L1 cache', value: data?.savingsByLayer.semanticCache ?? 0, color: '#22c55e' },
    { label: 'L2 router', value: data?.savingsByLayer.router ?? 0, color: '#7c8cf8' },
    { label: 'L3 prompt', value: data?.savingsByLayer.promptCache ?? 0, color: '#c0a0d8' },
  ];

  const projectOptions = [
    { value: 'all', label: 'all projects' },
    ...(projects ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  const cacheRate = data && data.cache.total > 0 ? (data.cache.hits / data.cache.total) * 100 : 0;
  const tierBars = Object.entries(data?.routerTiers ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ label: k, value: n, color: TIER_COLOR[k] ?? 'var(--color-accent)' }));
  const agentBars = (data?.byAgent ?? [])
    .slice()
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 8)
    .map((a) => ({ label: a.agentName, value: a.costUsd, color: a.agentColor || 'var(--color-accent)' }));

  return (
    <Section
      icon={<Bot style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Agentic — Chat & Runs"
      action={<FilterSelect value={projectId} onChange={setProjectId} options={projectOptions} />}
    >
      {!data ? (
        <span role="status" aria-live="polite" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>Loading agentic usage…</span>
      ) : data.totalRuns === 0 ? (
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No agentic activity in this range.</span>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <Stat label="runs" value={String(data.totalRuns)} />
            <Stat label="in" value={fmtTokens(data.totalInputTokens)} />
            <Stat label="out" value={fmtTokens(data.totalOutputTokens)} />
            <Stat label="cost" value={money(data.totalCostUsd)} />
            <Stat label="saved" value={money(data.totalSavedUsd)} color="#57a986" />
            <Stat label="saved %" value={`${data.savedPct.toFixed(1)}%`} color="#57a986" />
            <Stat label="cache hit" value={`${cacheRate.toFixed(0)}%`} color={cacheRate > 0 ? '#57a986' : undefined} />
          </div>

          {/* Savings by layer */}
          <div>
            <div className="flex items-center gap-2" style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 }}>
              <Layers style={{ width: 11, height: 11 }} /> savings by layer
            </div>
            <div className="flex flex-col gap-1.5">
              {layerRows.map((l) => (
                <div key={l.label} className="flex items-center justify-between" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  <span className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, background: l.color, borderRadius: 2, display: 'inline-block' }} />{l.label}
                  </span>
                  <span style={{ color: l.value > 0 ? '#6db58a' : 'var(--color-text-disabled)' }}>{money(l.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Router tiers (L2) + per-agent spend, side by side */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <div>
              <div className="flex items-center gap-2" style={SUBHEAD}><Route style={{ width: 11, height: 11 }} /> router tiers (L2)</div>
              {tierBars.length > 0 ? <Bars items={tierBars} fmtVal={fmt} /> : (
                <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No routing data.</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2" style={SUBHEAD}><Users2 style={{ width: 11, height: 11 }} /> by agent</div>
              {agentBars.length > 0 ? <Bars items={agentBars} fmtVal={money} /> : (
                <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No agent activity.</span>
              )}
            </div>
          </div>

          {/* Daily tokens & cost trend */}
          {data.byDate.length > 0 && (
            <div>
              <div className="flex items-center gap-2" style={SUBHEAD}><TrendingUp style={{ width: 11, height: 11 }} /> tokens &amp; cost · daily</div>
              <DailyBars data={data.byDate} />
            </div>
          )}

          {/* By model */}
          {data.byModel.length > 0 && (
            <div>
              <div style={SUBHEAD}>by model</div>
              <div className="flex flex-col gap-1">
                {data.byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    <code title={m.model} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)', minWidth: 0 }}>{m.model}</code>
                    <span style={{ flexShrink: 0 }}>{m.calls} · ↑{fmtTokens(m.inputTokens)} ↓{fmtTokens(m.outputTokens)} · {money(m.costUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
