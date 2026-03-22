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
  if (!steps || !agents || steps.length === 0) return null;

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

  const entries = Array.from(tokensByAgent.values());
  const maxTokens = Math.max(
    ...entries.map((e) => e.inputTokens + e.outputTokens),
    1,
  );

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-[11px] font-semibold uppercase text-text-tertiary tracking-wider">Token Usage by Agent</h4>
      <div className="flex flex-col gap-4">
        {entries.map((entry) => {
          const total = entry.inputTokens + entry.outputTokens;
          const inputPercent = (entry.inputTokens / maxTokens) * 100;
          const outputPercent = (entry.outputTokens / maxTokens) * 100;

          return (
            <div key={entry.agentId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] min-w-0">
                <span className="text-text-secondary truncate mr-2">{entry.name}</span>
                <span className="text-text-tertiary shrink-0 whitespace-nowrap">{formatTokenCount(total)}</span>
              </div>
              <div
                className="flex h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--color-bg-hover)' }}
              >
                <div
                  className="h-full rounded-l-full transition-all duration-200"
                  style={{
                    width: `${inputPercent}%`,
                    backgroundColor: entry.color,
                    opacity: 0.5,
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
              <div className="flex gap-3 text-[10px] text-text-tertiary">
                <span>In: {formatTokenCount(entry.inputTokens)}</span>
                <span>Out: {formatTokenCount(entry.outputTokens)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
