import type { RunStep, Agent } from '@subagent/shared';
import { formatTokenCount } from '../../lib/format';

interface TokenUsageChartProps {
  steps: RunStep[] | undefined;
  agents: Agent[] | undefined;
}

interface AgentTokens {
  agentId: string;
  name: string;
  color: string;
  inputTokens: number;
  outputTokens: number;
}

export function TokenUsageChart({ steps, agents }: TokenUsageChartProps) {
  if (!steps || !agents || steps.length === 0) {
    return (
      <div className="py-10 text-center" style={{ color: 'var(--color-text-secondary)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>No token data yet</p>
        <p style={{ fontSize: 11.5, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          Token usage by agent will appear once the run produces API calls.
        </p>
      </div>
    );
  }

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const tokensByAgent = new Map<string, AgentTokens>();

  for (const step of steps) {
    const existing = tokensByAgent.get(step.agentId);
    const agent = agentMap.get(step.agentId);
    if (existing) {
      existing.inputTokens += step.inputTokens;
      existing.outputTokens += step.outputTokens;
    } else {
      tokensByAgent.set(step.agentId, {
        agentId: step.agentId,
        name: agent?.name ?? 'Unknown',
        color: agent?.color ?? '#71717a',
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
      });
    }
  }

  const entries = Array.from(tokensByAgent.values()).sort(
    (a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens),
  );
  const maxTokens = Math.max(
    ...entries.map((e) => e.inputTokens + e.outputTokens),
    1,
  );
  const totals = entries.reduce(
    (acc, e) => ({ input: acc.input + e.inputTokens, output: acc.output + e.outputTokens }),
    { input: 0, output: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-[11px] font-semibold uppercase text-text-secondary tracking-wider">
          Token Usage by Agent
        </h4>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[10.5px] text-text-secondary" aria-label="Token legend">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-text-secondary)', opacity: 0.5, borderRadius: 2 }} />
            input
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--color-text-secondary)', borderRadius: 2 }} />
            output
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {entries.map((entry) => {
          const total = entry.inputTokens + entry.outputTokens;
          const inputPercent = (entry.inputTokens / maxTokens) * 100;
          const outputPercent = (entry.outputTokens / maxTokens) * 100;

          return (
            <div key={entry.agentId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11.5px] min-w-0">
                <span className="text-text-primary truncate mr-2" title={entry.name}>{entry.name}</span>
                <span className="text-text-secondary shrink-0 whitespace-nowrap">{formatTokenCount(total)}</span>
              </div>
              <div
                role="img"
                aria-label={`${entry.name}: ${formatTokenCount(entry.inputTokens)} input, ${formatTokenCount(entry.outputTokens)} output`}
                className="flex h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--color-bg-hover)' }}
              >
                <div
                  className="h-full rounded-l-full transition-all duration-200"
                  style={{
                    width: `${inputPercent}%`,
                    backgroundColor: entry.color,
                    opacity: 0.5,
                    // Diagonal stripes distinguish input from output without relying on color alone.
                    backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 3px, transparent 3px 6px)',
                  }}
                  title={`Input: ${formatTokenCount(entry.inputTokens)}`}
                />
                <div
                  className="h-full rounded-r-full transition-all duration-200"
                  style={{
                    width: `${outputPercent}%`,
                    backgroundColor: entry.color,
                  }}
                  title={`Output: ${formatTokenCount(entry.outputTokens)}`}
                />
              </div>
              <div className="flex gap-3 text-[10.5px] text-text-secondary">
                <span>In: {formatTokenCount(entry.inputTokens)}</span>
                <span>Out: {formatTokenCount(entry.outputTokens)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Totals row */}
      <div
        className="flex items-center justify-between text-[11px]"
        style={{
          padding: '8px 12px',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: 'var(--color-text-secondary)' }}>Total</span>
        <span style={{ color: 'var(--color-text-primary)' }}>
          In {formatTokenCount(totals.input)} · Out {formatTokenCount(totals.output)} · Sum {formatTokenCount(totals.input + totals.output)}
        </span>
      </div>
    </div>
  );
}
