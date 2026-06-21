import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Loader2, BarChart3, Zap, DollarSign, Play, PiggyBank } from 'lucide-react';
import { useProjectAnalytics } from '../../api/hooks/use-analytics';
import type { DateUsage, AnalyticsRange } from '../../api/hooks/use-analytics';

const RANGE_PRESETS: { value: AnalyticsRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function money(n: number): string {
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`;
}

const PANEL: React.CSSProperties = {
  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', padding: '14px 16px',
};
const PANEL_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)',
};

/** A row of labeled horizontal bars (value → width). */
function Bars({ items, fmtVal, color = '#6EACDA' }: { items: { label: string; value: number; color?: string }[]; fmtVal: (n: number) => string; color?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: 92, color: 'var(--color-text-secondary)', flexShrink: 0 }} className="truncate">{it.label}</span>
          <div style={{ flex: 1, height: 8, background: 'var(--color-bg-base)' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.color ?? color, opacity: 0.7 }} />
          </div>
          <span style={{ width: 70, textAlign: 'right', color: 'var(--color-text-disabled)', flexShrink: 0 }}>{fmtVal(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accentColor,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: `3px solid ${accentColor ?? 'var(--color-border-default)'}`,
        padding: '16px 20px',
      }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-text-disabled)' }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valueColor ?? 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function TokenBar({ inputTokens, outputTokens, maxTotal }: { inputTokens: number; outputTokens: number; maxTotal: number }) {
  const total = inputTokens + outputTokens;
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const inputPct = total > 0 ? (inputTokens / total) * 100 : 50;

  return (
    <div style={{ width: '100%', height: 6, background: 'var(--color-bg-raised)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', display: 'flex' }}>
        <div style={{ flex: inputPct, background: 'var(--color-accent)', opacity: 0.7 }} />
        <div style={{ flex: 100 - inputPct, background: 'var(--color-accent-muted)', opacity: 0.5 }} />
      </div>
    </div>
  );
}

function BarChart({ data }: { data: DateUsage[] }) {
  if (data.length === 0) return null;

  const maxTotal = Math.max(...data.map((d) => d.inputTokens + d.outputTokens), 1);

  return (
    <div>
      <div
        className="flex items-end gap-1"
        style={{ height: 80, padding: '0 2px' }}
      >
        {data.map((d) => {
          const total = d.inputTokens + d.outputTokens;
          const heightPct = (total / maxTotal) * 100;
          const inputPct = total > 0 ? (d.inputTokens / total) * 100 : 50;

          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end group relative"
              style={{ height: '100%', cursor: 'default' }}
              title={`${d.date}\nInput: ${fmt(d.inputTokens)}\nOutput: ${fmt(d.outputTokens)}\nCost: $${d.costUsd.toFixed(4)}`}
            >
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  minHeight: total > 0 ? 2 : 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  borderRadius: '2px 2px 0 0',
                  transition: 'opacity 0.15s',
                }}
              >
                <div style={{ flex: inputPct, background: 'var(--color-accent)', opacity: 0.65 }} />
                <div style={{ flex: 100 - inputPct, background: 'var(--color-accent-muted)', opacity: 0.45 }} />
              </div>
            </div>
          );
        })}
      </div>
      {/* X axis labels — show first, middle, last */}
      <div className="flex justify-between mt-1" style={{ fontSize: 9, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
        <span>{data[0]?.date.slice(5)}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>}
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function ProjectAnalyticsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading, isFetching } = useProjectAnalytics(projectId, { range, from, to });

  const FilterBar = (
    <div className="flex items-center gap-2 flex-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
      {RANGE_PRESETS.map((p) => {
        const active = range === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => setRange(p.value)}
            style={{
              height: 28, padding: '0 12px', fontSize: 11.5, cursor: 'pointer',
              background: active ? 'rgba(110,172,218,0.12)' : 'var(--color-bg-surface)',
              border: `1px solid ${active ? '#6EACDA' : 'var(--color-border-subtle)'}`,
              color: active ? '#6EACDA' : 'var(--color-text-disabled)',
            }}
          >
            {p.label}
          </button>
        );
      })}
      {range === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ height: 28, padding: '0 8px', fontSize: 11, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }} />
          <span style={{ color: 'var(--color-text-disabled)', fontSize: 11 }}>→</span>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ height: 28, padding: '0 8px', fontSize: 11, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }} />
        </div>
      )}
      {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--color-text-disabled)' }} />}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2" style={{ color: 'var(--color-text-disabled)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>Loading analytics...</span>
      </div>
    );
  }

  if (!data) return null;

  const maxAgentTotal = Math.max(
    ...data.byAgent.map((a) => a.inputTokens + a.outputTokens),
    1,
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Token Usage
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Token consumption and cost — filtered by time range
          </p>
        </div>
        {FilterBar}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Play className="h-3 w-3" />}
          label="Total Runs"
          value={String(data.totalRuns)}
        />
        <StatCard
          icon={<Zap className="h-3 w-3" />}
          label="Input Tokens"
          value={fmt(data.totalInputTokens)}
        />
        <StatCard
          icon={<BarChart3 className="h-3 w-3" />}
          label="Output Tokens"
          value={fmt(data.totalOutputTokens)}
        />
        <StatCard
          icon={<DollarSign className="h-3 w-3" />}
          label="Total Cost"
          value={`$${data.totalCostUsd.toFixed(4)}`}
          sub={data.totalRuns > 0 ? `~$${(data.totalCostUsd / data.totalRuns).toFixed(4)} / run` : undefined}
        />
        <StatCard
          icon={<PiggyBank className="h-3 w-3" />}
          label="Saved"
          value={`$${data.totalSavedUsd.toFixed(4)}`}
          sub={
            data.totalBaselineCostUsd > 0
              ? `${data.savedPct.toFixed(1)}% off $${data.totalBaselineCostUsd.toFixed(4)} baseline`
              : 'No baseline yet — run a few tasks'
          }
          accentColor={data.totalSavedUsd > 0 ? '#22c55e' : undefined}
          valueColor={data.totalSavedUsd > 0 ? '#22c55e' : undefined}
        />
      </div>

      {/* Savings by layer + cache/router */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div style={{ ...PANEL, borderLeft: '3px solid #22c55e' }}>
          <div style={PANEL_LABEL}>Savings by layer</div>
          <div style={{ marginTop: 12 }}>
            <Bars
              fmtVal={money}
              items={[
                { label: 'L0 compress', value: data.savingsByLayer.compression, color: '#e2b04a' },
                { label: 'L1 cache', value: data.savingsByLayer.semanticCache, color: '#22c55e' },
                { label: 'L2 router', value: data.savingsByLayer.router, color: '#6EACDA' },
                { label: 'L3 prompt', value: data.savingsByLayer.promptCache, color: '#c0a0d8' },
              ]}
            />
            <div style={{ fontSize: 10.5, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
              L0 = {data.compressionSavedTokens.toLocaleString()} input tokens trimmed before the call
            </div>
          </div>
        </div>

        <div style={{ ...PANEL, borderLeft: '3px solid #6EACDA' }}>
          <div style={PANEL_LABEL}>Semantic cache</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
              {data.cache.hitRate.toFixed(0)}%
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>hit rate</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            {data.cache.hits} hits · {data.cache.misses} misses · {data.cache.total} calls
          </div>
        </div>

        <div style={{ ...PANEL, borderLeft: '3px solid #c0a0d8' }}>
          <div style={PANEL_LABEL}>Router tiers</div>
          <div style={{ marginTop: 12 }}>
            <Bars
              fmtVal={(n) => String(n)}
              items={['TRIVIAL', 'SIMPLE', 'COMPLEX', 'NONE']
                .filter((t) => (data.routerTiers[t] ?? 0) > 0)
                .map((t) => ({ label: t.toLowerCase(), value: data.routerTiers[t] ?? 0 }))}
            />
            {Object.keys(data.routerTiers).length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>No routed calls.</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per-agent breakdown */}
        <div>
          <div
            className="flex items-center gap-3 mb-4"
            style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 12 }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              By Agent
            </span>
          </div>

          {data.byAgent.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              No run data yet — start a run to see agent usage.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.byAgent.map((agent) => (
                <div
                  key={agent.agentId}
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderLeft: `3px solid ${agent.agentColor}`,
                    padding: '12px 14px',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8, height: 8, borderRadius: '50%',
                          background: agent.agentColor,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {agent.agentName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
                      <span>{agent.runCount} run{agent.runCount !== 1 ? 's' : ''}</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>${agent.costUsd.toFixed(4)}</span>
                    </div>
                  </div>
                  <TokenBar
                    inputTokens={agent.inputTokens}
                    outputTokens={agent.outputTokens}
                    maxTotal={maxAgentTotal}
                  />
                  <div className="flex justify-between mt-1.5" style={{ fontSize: 10, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
                    <span>↑ {fmt(agent.inputTokens)} in</span>
                    <span>↓ {fmt(agent.outputTokens)} out</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily chart */}
        <div>
          <div
            className="flex items-center gap-3 mb-4"
            style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 12 }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              Over Time {range !== 'custom' && range !== 'all' ? `(${range})` : ''}
            </span>
            <div className="flex items-center gap-3 ml-auto" style={{ fontSize: 9, color: 'var(--color-text-disabled)' }}>
              <span className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-accent)', opacity: 0.7 }} />
                input
              </span>
              <span className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-accent-muted)', opacity: 0.5 }} />
                output
              </span>
            </div>
          </div>

          {data.byDate.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              No activity in the last 30 days.
            </p>
          ) : (
            <BarChart data={data.byDate} />
          )}

          {/* Daily cost summary */}
          {data.byDate.length > 0 && (
            <div
              className="mt-4 flex flex-col gap-1"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                padding: '10px 14px',
              }}
            >
              {data.byDate.slice(-5).reverse().map((d) => (
                <div key={d.date} className="flex items-center justify-between" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--color-text-disabled)' }}>{d.date}</span>
                  <div className="flex items-center gap-3" style={{ color: 'var(--color-text-tertiary)' }}>
                    <span>{fmt(d.inputTokens + d.outputTokens)} tok</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>${d.costUsd.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* By model + token mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 12 }}>
            <span style={PANEL_LABEL}>By Model</span>
          </div>
          {data.byModel.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>No model data yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {data.byModel.map((m) => (
                <div key={m.model} className="flex items-center justify-between gap-3" style={{ padding: '8px 12px', ...PANEL }}>
                  <div style={{ minWidth: 0 }}>
                    <code className="truncate" style={{ fontSize: 12, color: 'var(--color-text-primary)', display: 'block' }}>{m.model}</code>
                    <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                      {m.calls} call{m.calls !== 1 ? 's' : ''} · {fmt(m.inputTokens + m.outputTokens)} tok
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{money(m.costUsd)}</div>
                    {m.savedUsd > 0 && <div style={{ fontSize: 10.5, color: '#22c55e' }}>saved {money(m.savedUsd)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 12 }}>
            <span style={PANEL_LABEL}>Token Mix</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <Bars
              fmtVal={fmt}
              items={[
                { label: 'input', value: data.tokenMix.input, color: '#6EACDA' },
                { label: 'output', value: data.tokenMix.output, color: '#e2b04a' },
                { label: 'cache read', value: data.tokenMix.cacheRead, color: '#22c55e' },
                { label: 'cache write', value: data.tokenMix.cacheCreation, color: '#c0a0d8' },
              ]}
            />
            <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 10 }}>
              cache read tokens are billed at ~10% — more cache read = more savings
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>L0 compression saved (input)</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{fmt(data.compressionSavedTokens)} tok</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent calls */}
      <div>
        <div className="flex items-center gap-3 mb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 12 }}>
          <span style={PANEL_LABEL}>Recent Calls</span>
        </div>
        {data.recentCalls.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>No calls in this range.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {data.recentCalls.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3" style={{ padding: '6px 12px', ...PANEL, fontFamily: 'var(--font-mono)' }}>
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.agentColor, flexShrink: 0 }} />
                  <code className="truncate" style={{ fontSize: 11.5, color: 'var(--color-text-primary)' }}>{c.model}</code>
                  {c.cacheHit && <span style={{ fontSize: 9.5, color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', padding: '0 4px' }}>cache</span>}
                  {c.routerTier && c.routerTier !== 'COMPLEX' && <span style={{ fontSize: 9.5, color: '#6EACDA', border: '1px solid rgba(110,172,218,0.4)', padding: '0 4px' }}>{c.routerTier.toLowerCase()}</span>}
                </div>
                <div className="flex items-center gap-3" style={{ flexShrink: 0, fontSize: 11, color: 'var(--color-text-disabled)' }}>
                  <span>{fmt(c.inputTokens)}↑ {fmt(c.outputTokens)}↓</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{money(c.costUsd)}</span>
                  <span>{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
