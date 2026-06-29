import { useState, useMemo } from 'react';
import { Zap, PiggyBank, Database, Layers as LayersIcon, Cpu, Users2, Gauge as GaugeIcon } from 'lucide-react';
import { useGlobalAnalytics, useUsageByUser, type AnalyticsRange } from '../../api/hooks/use-analytics';
import { useGatewayUsage } from '../../api/hooks/use-gateway';
import { useMe, useGroups, useGroupUsage } from '../../api/hooks/use-auth';
import { AgenticUsage } from './agentic-usage';
import { GatewayUsage } from './gateway-usage';
import { Kpi, Gauge, Bars, DailyBars, SURFACE, LABEL, fmt, money, useCountUp } from '../charts/usage-bits';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '24h', label: '24h' }, { value: '7d', label: '7d' },
  { value: '30d', label: '30d' }, { value: '90d', label: '90d' }, { value: 'all', label: 'all' },
];

/** Org-wide usage dashboard — KPI cards + charts (agentic + gateway), then filterable drill-downs. */
export function UsageTab() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data: agentic } = useGlobalAnalytics({ range });
  const { data: gw } = useGatewayUsage({ range });
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const { data: byUser } = useUsageByUser(isAdmin ? { range } : {});
  const { data: groups } = useGroups();
  const { data: groupUsage } = useGroupUsage();

  const total = {
    inputTokens: (agentic?.totalInputTokens ?? 0) + (gw?.totalInputTokens ?? 0),
    outputTokens: (agentic?.totalOutputTokens ?? 0) + (gw?.totalOutputTokens ?? 0),
    costUsd: (agentic?.totalCostUsd ?? 0) + (gw?.totalCostUsd ?? 0),
    baselineUsd: (agentic?.totalBaselineCostUsd ?? 0) + (gw?.totalBaselineUsd ?? 0),
    savedUsd: (agentic?.totalSavedUsd ?? 0) + (gw?.savedUsd ?? 0),
  };
  const savedPct = total.baselineUsd > 0 ? (total.savedUsd / total.baselineUsd) * 100 : 0;
  const calls = (agentic?.totalRuns ?? 0) + (gw?.totalRequests ?? 0);
  const cacheRate = agentic?.cache.hitRate ?? 0;

  const spend = useCountUp(total.costUsd);
  const saved = useCountUp(total.savedUsd);
  const tokens = useCountUp(total.inputTokens + total.outputTokens);

  // Merge per-model cost/in/out across agentic + gateway.
  const byModel = useMemo(() => {
    const map = new Map<string, { model: string; inputTokens: number; outputTokens: number; costUsd: number }>();
    const add = (model: string, i: number, o: number, c: number) => {
      const cur = map.get(model) ?? { model, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += i; cur.outputTokens += o; cur.costUsd += c;
      map.set(model, cur);
    };
    for (const m of agentic?.byModel ?? []) add(m.model, m.inputTokens, m.outputTokens, m.costUsd);
    for (const m of gw?.byModel ?? []) add(m.label, m.inputTokens, m.outputTokens, m.costUsd);
    return [...map.values()].sort((a, b) => b.costUsd - a.costUsd).slice(0, 8);
  }, [agentic, gw]);

  const byProject = (agentic?.byProject ?? []).slice().sort((a, b) => b.costUsd - a.costUsd).slice(0, 8);
  const layer = agentic?.savingsByLayer ?? { compression: 0, semanticCache: 0, router: 0, promptCache: 0 };
  const mix = agentic?.tokenMix ?? { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  const hasAny = total.inputTokens + total.outputTokens > 0;

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {/* Range selector */}
      <div className="flex items-center" style={{ gap: 4 }} role="group" aria-label="Time range">
        {RANGES.map((r) => {
          const on = range === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={on}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 32, padding: '0 14px', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {!agentic || !gw ? (
        <div style={{ ...SURFACE, padding: '40px', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }} role="status" aria-live="polite">
          Loading usage data…
        </div>
      ) : !hasAny ? (
        <div style={{ ...SURFACE, padding: '40px', textAlign: 'center', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>No activity in this range</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>Pick a wider time range, or start a chat to generate usage.</div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            <Kpi icon={<Zap style={{ width: 13, height: 13 }} />} label="Spend" value={`$${spend.toFixed(4)}`} sub="agentic + gateway" accent="var(--color-accent)" />
            <Kpi icon={<PiggyBank style={{ width: 13, height: 13 }} />} label="Saved" value={`$${saved.toFixed(4)}`} sub={`${savedPct.toFixed(1)}% off baseline`} accent="var(--color-success)" />
            <Kpi icon={<Database style={{ width: 13, height: 13 }} />} label="Tokens" value={fmt(tokens)} sub={`${fmt(agentic?.compressionSavedTokens ?? 0)} trimmed (L0)`} accent="var(--color-info)" />
            <Kpi icon={<Cpu style={{ width: 13, height: 13 }} />} label="Calls" value={fmt(calls)} sub={`${agentic?.totalRuns ?? 0} runs · ${gw?.totalRequests ?? 0} gw`} accent="var(--color-warning)" />
          </div>

          {/* Gauges + savings by layer */}
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            <div className="flex items-center" style={{ ...SURFACE, gap: 24, flex: 1, minWidth: 250, padding: '16px 18px' }}>
              <Gauge pct={savedPct} center={`${savedPct.toFixed(0)}%`} label="cost saved" accent="var(--color-success)" />
              <Gauge pct={cacheRate} center={`${cacheRate.toFixed(0)}%`} label="L1 cache hit" accent="var(--color-warning)" />
            </div>
            <div style={{ ...SURFACE, flex: 1.3, minWidth: 280, padding: '14px 16px' }}>
              <div className="flex items-center gap-2" style={LABEL}><LayersIcon style={{ width: 12, height: 12 }} /> Savings by layer</div>
              <div style={{ marginTop: 12 }}>
                <Bars fmtVal={money} items={[
                  { label: 'L0 compress', value: layer.compression, color: 'var(--color-warning)' },
                  { label: 'L1 cache', value: layer.semanticCache, color: 'var(--color-success)' },
                  { label: 'L2 router', value: layer.router, color: 'var(--color-accent)' },
                  { label: 'L3 prompt', value: layer.promptCache, color: 'var(--color-agent-documentation)' },
                ]} />
              </div>
            </div>
          </div>

          {/* By project + by model */}
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            <div style={{ ...SURFACE, flex: 1, minWidth: 300, padding: '14px 16px' }}>
              <div style={LABEL}>By project (cost)</div>
              <div style={{ marginTop: 12 }}>
                <Bars fmtVal={money} items={byProject.map((p) => ({ label: p.projectName, value: p.costUsd, color: 'var(--color-accent)' }))} />
              </div>
            </div>
            <div style={{ ...SURFACE, flex: 1, minWidth: 300, padding: '14px 16px' }}>
              <div style={LABEL}>By model (cost)</div>
              <div style={{ marginTop: 12 }}>
                <Bars fmtVal={money} items={byModel.map((m) => ({ label: m.model, value: m.costUsd, color: 'var(--color-info)' }))} />
              </div>
            </div>
          </div>

          {/* By user + by group (admin) */}
          {isAdmin && (
            <div className="flex flex-wrap" style={{ gap: 10 }}>
              <div style={{ ...SURFACE, flex: 1, minWidth: 300, padding: '14px 16px' }}>
                <div className="flex items-center gap-2" style={LABEL}><Users2 style={{ width: 12, height: 12 }} /> By user / key (tokens)</div>
                <div style={{ marginTop: 12 }}>
                  <Bars fmtVal={fmt} items={(byUser ?? []).slice(0, 8).map((u) => ({
                    label: u.label, value: u.totalTokens,
                    color: u.key.startsWith('gw:') ? 'var(--color-warning)' : 'var(--color-accent)',
                  }))} />
                  {(byUser ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No attributed usage yet.</span>}
                </div>
              </div>
              <div style={{ ...SURFACE, flex: 1, minWidth: 300, padding: '14px 16px' }}>
                <div className="flex items-center gap-2" style={LABEL}><GaugeIcon style={{ width: 12, height: 12 }} /> By group · quota (this month)</div>
                <div className="flex flex-col" style={{ marginTop: 12, gap: 10 }}>
                  {(groups ?? []).map((g) => {
                    const u = (groupUsage ?? []).find((x) => x.groupId === g.id);
                    const used = u?.totalTokens ?? 0;
                    const quota = g.tokenQuota ?? null;
                    const pct = quota && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
                    const over = quota != null && used >= quota;
                    return (
                      <div key={g.id}>
                        <div className="flex items-center justify-between" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{g.name}</span>
                          <span style={{ color: over ? 'var(--color-error)' : 'var(--color-text-disabled)' }}>{fmt(used)} {quota ? `/ ${fmt(quota)}` : '/ ∞'}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${quota ? pct : 0}%`, background: over ? 'var(--color-error)' : 'var(--color-accent)', transition: 'width .3s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {(groups ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No groups yet.</span>}
                </div>
              </div>
            </div>
          )}

          {/* Daily trend + token mix */}
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            <div style={{ ...SURFACE, flex: 1.3, minWidth: 300, padding: '14px 16px' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <span style={LABEL}>Over time (agentic)</span>
                <span className="flex items-center gap-3" style={{ fontSize: 9, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
                  <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: 'var(--color-accent)', opacity: 0.7 }} />input</span>
                  <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, background: 'var(--color-accent-muted)', opacity: 0.45 }} />output</span>
                </span>
              </div>
              <DailyBars data={agentic?.byDate ?? []} />
            </div>
            <div style={{ ...SURFACE, flex: 1, minWidth: 280, padding: '14px 16px' }}>
              <div style={LABEL}>Token mix</div>
              <div style={{ marginTop: 12 }}>
                <Bars fmtVal={fmt} items={[
                  { label: 'input', value: mix.input, color: 'var(--color-accent)' },
                  { label: 'output', value: mix.output, color: 'var(--color-warning)' },
                  { label: 'cache read', value: mix.cacheRead, color: 'var(--color-success)' },
                  { label: 'cache write', value: mix.cacheCreation, color: 'var(--color-agent-documentation)' },
                ]} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Filterable drill-downs */}
      <AgenticUsage range={range} />
      <GatewayUsage range={range} />
    </div>
  );
}
