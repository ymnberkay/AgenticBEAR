import { useParams } from '@tanstack/react-router';
import { Loader2, BarChart3, Zap, DollarSign, Play } from 'lucide-react';
import { useProjectAnalytics } from '../../api/hooks/use-analytics';
import type { DateUsage } from '../../api/hooks/use-analytics';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderLeft: '3px solid var(--color-border-default)',
        padding: '16px 20px',
      }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-text-disabled)' }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
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
  const { data, isLoading } = useProjectAnalytics(projectId);

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
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Token Usage
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Cumulative token consumption and cost across all runs
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              Last 30 Days
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
    </div>
  );
}
