import { useState } from 'react';
import { Zap, Database, Cpu, PiggyBank, Gauge as GaugeIcon, Activity, KeyRound, TrendingUp, Filter, BarChart3 } from 'lucide-react';
import { useGatewayUsage, useGatewayKeys, useModelCatalog } from '../../api/hooks/use-gateway';
import type { AnalyticsRange } from '../../api/hooks/use-analytics';
import { FilterSelect } from './ui';
import { Panel } from './gateway-ui';
import { Kpi, Gauge, Bars, DailyBars, DailyRequestBars, LABEL, fmt, money } from '../charts/usage-bits';
import { formatModelId } from '../../lib/format';

const BAR_COLORS = ['#7c8cf8', '#22c55e', '#e2b04a', '#c0a0d8', '#6db58a', '#d88aa0', '#5fb3d4', '#e0a06a'];

/** External gateway (API-key) usage — a full dashboard: KPIs, over-time, by-model/by-key, cache. */
export function GatewayUsage({ range }: { range: AnalyticsRange }) {
  const [keyId, setKeyId] = useState('all');
  const [model, setModel] = useState('all');

  // Unfiltered (range only) → builds the dropdowns + a stable key list.
  const base = useGatewayUsage({ range });
  // Filtered view actually shown.
  const { data } = useGatewayUsage({
    range,
    keyId: keyId === 'all' ? undefined : keyId,
    model: model === 'all' ? undefined : model,
  });
  const { data: keys } = useGatewayKeys();
  const { data: catalog } = useModelCatalog();

  const keyName = (id: string) => (id === '(none)' ? '(open / no key)' : keys?.find((k) => k.id === id)?.name || id.slice(0, 8));

  const modelLabel = (id: string): string => formatModelId(id, catalog?.find((c) => c.id === id)?.owned_by);

  const keyOptions = [
    { value: 'all', label: 'all keys' },
    ...(base.data?.byKey ?? []).map((b) => ({ value: b.key, label: keyName(b.key) })),
  ];
  const modelOptions = [
    { value: 'all', label: 'all models' },
    ...(base.data?.byModel ?? []).map((b) => ({ value: b.key, label: modelLabel(b.key) })),
  ];

  const tokens = (data?.totalInputTokens ?? 0) + (data?.totalOutputTokens ?? 0);
  const cacheRate = data && data.totalRequests > 0 ? (data.cacheHits / data.totalRequests) * 100 : 0;
  const avgCost = data && data.totalRequests > 0 ? data.totalCostUsd / data.totalRequests : 0;
  const savedPct = data && data.totalBaselineUsd > 0 ? (data.savedUsd / data.totalBaselineUsd) * 100 : 0;

  const modelBars = (data?.byModel ?? []).slice(0, 8).map((m, i) => ({ label: modelLabel(m.key), value: m.costUsd, color: BAR_COLORS[i % BAR_COLORS.length]! }));
  const keyBars = (data?.byKey ?? []).slice(0, 8).map((k, i) => ({ label: keyName(k.key), value: k.costUsd, color: BAR_COLORS[i % BAR_COLORS.length]! }));

  // Filter toolbar — always visible so users can change scope even on empty state.
  const filterBar = (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{
        padding: '10px 14px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span className="flex items-center gap-1.5" style={{ ...LABEL, marginRight: 6 }}>
        <Filter style={{ width: 11, height: 11 }} aria-hidden="true" /> Gateway · external apps
      </span>
      <span style={{ flex: 1 }} aria-hidden="true" />
      <FilterSelect value={keyId} onChange={setKeyId} options={keyOptions} />
      <FilterSelect value={model} onChange={setModel} options={modelOptions} />
    </div>
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {filterBar}
        <span role="status" aria-live="polite" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>Loading gateway usage…</span>
      </div>
    );
  }

  if (data.totalRequests === 0) {
    return (
      <div className="flex flex-col gap-3">
        {filterBar}
        <div style={{ padding: 24, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          No gateway calls for this filter.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filterBar}

      {/* KPI row — 5 cards in a tidy grid */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12 }}>
        <Kpi icon={<Activity style={{ width: 13, height: 13 }} />} label="Requests" value={fmt(data.totalRequests)} sub={`${money(avgCost)} avg/req`} accent="var(--color-warning)" />
        <Kpi icon={<Database style={{ width: 13, height: 13 }} />} label="Tokens" value={fmt(tokens)} sub={`↑${fmt(data.totalInputTokens)} ↓${fmt(data.totalOutputTokens)}`} accent="var(--color-info)" />
        <Kpi icon={<Zap style={{ width: 13, height: 13 }} />} label="Spend" value={money(data.totalCostUsd)} sub="actual cost" accent="var(--color-accent)" />
        <Kpi icon={<PiggyBank style={{ width: 13, height: 13 }} />} label="Saved" value={money(data.savedUsd)} sub={`${savedPct.toFixed(1)}% vs baseline`} accent="#6db58a" />
        <Kpi icon={<GaugeIcon style={{ width: 13, height: 13 }} />} label="Cache hits" value={`${cacheRate.toFixed(1)}%`} sub={`${fmt(data.cacheHits)} of ${fmt(data.totalRequests)}`} accent="#22c55e" />
      </div>

      {/* Over time — two stacked panels: API requests (with cache/live split) and tokens+cost */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel icon={<BarChart3 style={{ width: 12, height: 12 }} />} color="#e2b04a" title="API requests · daily">
          <DailyRequestBars data={data.byDate.map((d) => ({ date: d.date, requests: d.requests ?? 0, cacheHits: d.cacheHits ?? 0 }))} />
        </Panel>
        <Panel icon={<TrendingUp style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="Tokens & cost · daily">
          <DailyBars data={data.byDate} />
        </Panel>
      </div>

      {/* Breakdowns — three equal columns: by model | cache efficiency | by key */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel icon={<Cpu style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="By model">
          <Bars items={modelBars} fmtVal={money} />
        </Panel>

        <Panel icon={<GaugeIcon style={{ width: 12, height: 12 }} />} color="#22c55e" title="Cache efficiency">
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: '8px 4px' }}>
            <Gauge pct={cacheRate} label={`${fmt(data.cacheHits)} cached`} accent="#22c55e" center={`${cacheRate.toFixed(0)}%`} />
            <div className="flex items-center gap-4" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e' }} />
                {fmt(data.cacheHits)} hits
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)' }} />
                {fmt(data.totalRequests - data.cacheHits)} miss
              </span>
            </div>
          </div>
        </Panel>

        <Panel icon={<KeyRound style={{ width: 12, height: 12 }} />} color="#d88aa0" title="By key">
          <Bars items={keyBars} fmtVal={money} />
        </Panel>
      </div>
    </div>
  );
}
