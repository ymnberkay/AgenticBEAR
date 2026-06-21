import { useState, useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { useGlobalAnalytics, type AnalyticsRange } from '../../api/hooks/use-analytics';
import { useGatewayUsage } from '../../api/hooks/use-gateway';
import { Section, Stat, money, fmtTokens } from './ui';
import { AgenticUsage } from './agentic-usage';
import { GatewayUsage } from './gateway-usage';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'all' },
];

/** Org-wide usage dashboard: a combined overview on top, then agentic + gateway split below. */
export function UsageTab() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data: agentic } = useGlobalAnalytics({ range });
  const { data: gw } = useGatewayUsage({ range });

  // Combined org totals (in-app agentic runs + external gateway calls).
  const total = {
    inputTokens: (agentic?.totalInputTokens ?? 0) + (gw?.totalInputTokens ?? 0),
    outputTokens: (agentic?.totalOutputTokens ?? 0) + (gw?.totalOutputTokens ?? 0),
    costUsd: (agentic?.totalCostUsd ?? 0) + (gw?.totalCostUsd ?? 0),
    baselineUsd: (agentic?.totalBaselineCostUsd ?? 0) + (gw?.totalBaselineUsd ?? 0),
    savedUsd: (agentic?.totalSavedUsd ?? 0) + (gw?.savedUsd ?? 0),
  };
  const savedPct = total.baselineUsd > 0 ? (total.savedUsd / total.baselineUsd) * 100 : 0;

  // Merge per-model in/out/cost across both sources for the overview table.
  const byModel = useMemo(() => {
    const map = new Map<string, { model: string; inputTokens: number; outputTokens: number; costUsd: number }>();
    const add = (model: string, i: number, o: number, c: number) => {
      const cur = map.get(model) ?? { model, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += i; cur.outputTokens += o; cur.costUsd += c;
      map.set(model, cur);
    };
    for (const m of agentic?.byModel ?? []) add(m.model, m.inputTokens, m.outputTokens, m.costUsd);
    for (const m of gw?.byModel ?? []) add(m.label, m.inputTokens, m.outputTokens, m.costUsd);
    return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
  }, [agentic, gw]);

  const hasAny = total.inputTokens + total.outputTokens > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Range selector */}
      <div className="flex items-center gap-1">
        {RANGES.map((r) => (
          <button key={r.value} type="button" onClick={() => setRange(r.value)}
            style={{
              height: 28, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer',
              background: range === r.value ? 'rgba(110,172,218,0.15)' : 'var(--color-bg-surface)',
              border: `1px solid ${range === r.value ? 'rgba(110,172,218,0.5)' : 'var(--color-border-subtle)'}`,
              color: range === r.value ? '#6EACDA' : 'var(--color-text-disabled)',
            }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Overview — everything combined */}
      <Section icon={<Gauge style={{ width: 13, height: 13 }} />} color="#6db58a" title="Overview — Organization (agentic + gateway)">
        {!hasAny ? (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No activity in this range.</span>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <Stat label="input" value={fmtTokens(total.inputTokens)} />
              <Stat label="output" value={fmtTokens(total.outputTokens)} />
              <Stat label="cost" value={money(total.costUsd)} />
              <Stat label="baseline" value={money(total.baselineUsd)} />
              <Stat label="saved" value={money(total.savedUsd)} color={total.savedUsd > 0 ? '#6db58a' : undefined} />
              <Stat label="saved %" value={`${savedPct.toFixed(1)}%`} color={total.savedUsd > 0 ? '#6db58a' : undefined} />
            </div>
            {byModel.length > 0 && (
              <div>
                <div className="flex items-center justify-between" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', paddingBottom: 4 }}>
                  <span>by model</span>
                  <span className="flex items-center gap-6"><span style={{ width: 70, textAlign: 'right' }}>in</span><span style={{ width: 70, textAlign: 'right' }}>out</span><span style={{ width: 70, textAlign: 'right' }}>cost</span></span>
                </div>
                {byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', padding: '3px 0' }}>
                    <code className="truncate" style={{ color: 'var(--color-text-primary)', maxWidth: '45%' }}>{m.model}</code>
                    <span className="flex items-center gap-6" style={{ flexShrink: 0 }}>
                      <span style={{ width: 70, textAlign: 'right' }}>{fmtTokens(m.inputTokens)}</span>
                      <span style={{ width: 70, textAlign: 'right' }}>{fmtTokens(m.outputTokens)}</span>
                      <span style={{ width: 70, textAlign: 'right' }}>{money(m.costUsd)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Split: agentic (project-filterable) + gateway (key/model-filterable) */}
      <AgenticUsage range={range} />
      <GatewayUsage range={range} />
    </div>
  );
}
