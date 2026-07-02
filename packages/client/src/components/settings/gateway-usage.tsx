import { useState } from 'react';
import { Zap, Database, Cpu, PiggyBank, Gauge as GaugeIcon, Activity, KeyRound, TrendingUp, Filter, BarChart3, Timer, AlertTriangle, Route, Layers, Users2 } from 'lucide-react';
import { useGatewayUsage, useGatewayKeys, useModelCatalog } from '../../api/hooks/use-gateway';
import { useGroups, useGroupUsage } from '../../api/hooks/use-auth';
import type { AnalyticsRange } from '../../api/hooks/use-analytics';
import { FilterSelect } from './ui';
import { Panel } from './gateway-ui';
import { Kpi, Gauge, Bars, DailyBars, DailyRequestBars, LABEL, fmt, money } from '../charts/usage-bits';
import { formatModelId } from '../../lib/format';

const BAR_COLORS = ['#7c8cf8', '#22c55e', '#e2b04a', '#c0a0d8', '#6db58a', '#d88aa0', '#5fb3d4', '#e0a06a'];
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
/** Friendly labels + colors for gateway request outcomes (statusCounts keys). */
const STATUS_META: Record<string, { label: string; color: string }> = {
  error: { label: 'upstream error', color: 'var(--color-error)' },
  rate_limited: { label: 'rate limited', color: '#e2b04a' },
  quota_exceeded: { label: 'quota exceeded', color: '#e0a06a' },
  model_not_allowed: { label: 'model blocked', color: '#c0a0d8' },
  dlp_blocked: { label: 'DLP blocked', color: '#d88aa0' },
};
const TIER_COLOR: Record<string, string> = { TRIVIAL: '#57a986', SIMPLE: '#7c8cf8', COMPLEX: '#e2b04a', '(none)': 'var(--color-text-tertiary)' };

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
  const { data: groups } = useGroups();
  const { data: groupUsage } = useGroupUsage();

  const keyName = (id: string) => (id === '(none)' ? '(open / no key)' : keys?.find((k) => k.id === id)?.name || id.slice(0, 8));
  const groupName = (id: string) => (id === '(none)' ? 'no group' : groups?.find((g) => g.id === id)?.name || id.slice(0, 8));

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
  const groupBars = (data?.byGroup ?? []).slice(0, 8).map((g, i) => ({ label: groupName(g.key), value: g.costUsd, color: BAR_COLORS[i % BAR_COLORS.length]! }));

  // Reliability: total attempts = ok + all non-ok outcomes; error rate over attempts.
  const attempts = data ? Object.values(data.statusCounts).reduce((s, n) => s + n, 0) : 0;
  const errorRate = attempts > 0 ? ((data?.errorRequests ?? 0) / attempts) * 100 : 0;
  const statusBars = Object.entries(data?.statusCounts ?? {})
    .filter(([k]) => k !== 'ok')
    .map(([k, n]) => ({ label: STATUS_META[k]?.label ?? k, value: n, color: STATUS_META[k]?.color ?? 'var(--color-error)' }));
  const tierBars = Object.entries(data?.routerTierCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ label: k, value: n, color: TIER_COLOR[k] ?? 'var(--color-accent)' }));
  const cacheKindBars = (['exact', 'semantic', 'judge'] as const)
    .map((k) => ({ label: k, value: data?.cacheKindCounts[k] ?? 0, color: k === 'exact' ? '#57a986' : k === 'semantic' ? '#7c8cf8' : '#e2b04a' }))
    .filter((b) => b.value > 0);
  // Quota burn-down: groups that actually have a monthly token quota set.
  const quotaRows = (groupUsage ?? []).filter((g) => g.quota && g.quota > 0);

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
        {data.latency && (
          <Kpi icon={<Timer style={{ width: 13, height: 13 }} />} label="Latency p95" value={fmtMs(data.latency.p95)} sub={`p50 ${fmtMs(data.latency.p50)} · p99 ${fmtMs(data.latency.p99)}`} accent="#7c8cf8" />
        )}
        <Kpi icon={<AlertTriangle style={{ width: 13, height: 13 }} />} label="Error rate" value={`${errorRate.toFixed(1)}%`} sub={`${fmt(data.errorRequests)} of ${fmt(attempts)} attempts`} accent="var(--color-error)" />
      </div>

      {/* Over time — two stacked panels: API requests (with cache/live split) and tokens+cost */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Panel icon={<BarChart3 style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="API requests · daily">
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

        <Panel icon={<GaugeIcon style={{ width: 12, height: 12 }} />} color="#57a986" title="Cache efficiency">
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

        <Panel icon={<KeyRound style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="By key">
          <Bars items={keyBars} fmtVal={money} />
        </Panel>
      </div>

      {/* Observability — latency, reliability, and L2 router effectiveness */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel icon={<Timer style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="Latency (ok calls)">
          {data.latency ? (
            <div className="flex flex-col gap-2" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              {([['p50', data.latency.p50], ['p95', data.latency.p95], ['p99', data.latency.p99], ['avg', data.latency.avg]] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtMs(v)}</span>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{fmt(data.latency.count)} samples</div>
            </div>
          ) : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No latency recorded yet.</span>
          )}
        </Panel>

        <Panel icon={<AlertTriangle style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="Errors & rejections">
          {statusBars.length > 0 ? <Bars items={statusBars} fmtVal={fmt} /> : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>No errors or rejections in range.</span>
          )}
        </Panel>

        <Panel icon={<Route style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="Router tiers (L2)">
          {tierBars.length > 0 ? <Bars items={tierBars} fmtVal={fmt} /> : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No routing data.</span>
          )}
        </Panel>
      </div>

      {/* Attribution — L1 cache paths, per-group spend, and monthly quota burn-down */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel icon={<Layers style={{ width: 12, height: 12 }} />} color="#57a986" title="Cache paths (L1)">
          {cacheKindBars.length > 0 ? <Bars items={cacheKindBars} fmtVal={fmt} /> : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No cache hits yet.</span>
          )}
        </Panel>

        <Panel icon={<Users2 style={{ width: 12, height: 12 }} />} color="#7c8cf8" title="By group">
          {groupBars.length > 0 ? <Bars items={groupBars} fmtVal={money} /> : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No group attribution.</span>
          )}
        </Panel>

        <Panel icon={<GaugeIcon style={{ width: 12, height: 12 }} />} color="#57a986" title="Group quota · this month">
          {quotaRows.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {quotaRows.map((g) => {
                const pct = g.quota ? Math.min(100, (g.totalTokens / g.quota) * 100) : 0;
                const over = g.quota != null && g.totalTokens >= g.quota;
                return (
                  <div key={g.groupId}>
                    <div className="flex items-center justify-between" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{groupName(g.groupId)}</span>
                      <span style={{ color: over ? 'var(--color-error)' : 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 8 }}>{fmt(g.totalTokens)} / {fmt(g.quota ?? 0)}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--color-bg-base)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--color-error)' : 'var(--color-accent)', transition: 'width .3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No group quotas set.</span>
          )}
        </Panel>
      </div>
    </div>
  );
}
