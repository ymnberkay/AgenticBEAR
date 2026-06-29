import { useEffect, useRef } from 'react';
import { Activity, ArrowDown } from 'lucide-react';
import type { RunStep, Agent } from '@subagent/shared';
import { RunStepCard } from './run-step-card';
import { HandoffIndicator } from './handoff-indicator';
import { Skeleton } from '../ui/skeleton';

type LatestRef = HTMLLIElement | null;

interface RunTimelineProps {
  steps: RunStep[] | undefined;
  agents: Agent[] | undefined;
  isLoading: boolean;
}

export function RunTimeline({ steps, agents, isLoading }: RunTimelineProps) {
  const latestRef = useRef<LatestRef>(null);

  // Jump to latest step when new entries arrive.
  const lastId = steps && steps.length > 0 ? steps[steps.length - 1]?.id : null;
  useEffect(() => {
    if (!lastId) return;
    latestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lastId]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Loading run timeline">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center text-center" style={{ color: 'var(--color-text-secondary)' }}>
        <div
          aria-hidden="true"
          className="flex items-center justify-center mb-3"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.2)',
          }}
        >
          <Activity style={{ width: 18, height: 18, color: 'var(--color-accent)' }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
          No steps recorded yet
        </div>
        <p style={{ fontSize: 12, marginTop: 4, maxWidth: 360 }}>
          Start the run to see each agent step, file change, and handoff appear here in order.
        </p>
      </div>
    );
  }

  const agentMap = new Map(agents?.map((a) => [a.id, a]));

  return (
    <div className="relative">
      <ol className="relative flex flex-col overflow-hidden m-0 p-0 list-none">
        {/* Vertical connector line */}
        <div
          className="absolute left-[23px] top-4 bottom-4 w-px"
          style={{ background: 'var(--color-border-subtle)' }}
          aria-hidden="true"
        />

        {steps.map((step, i) => {
          const agent = agentMap.get(step.agentId);
          const prevStep = i > 0 ? steps[i - 1] : null;
          const isHandoff = prevStep && prevStep.agentId !== step.agentId;
          const isLast = i === steps.length - 1;

          return (
            <li key={step.id} ref={isLast ? latestRef : undefined}>
              {isHandoff && (
                <HandoffIndicator
                  fromAgent={agentMap.get(prevStep!.agentId)}
                  toAgent={agent}
                />
              )}
              <RunStepCard step={step} agent={agent} />
            </li>
          );
        })}
      </ol>
      {steps.length >= 8 && (
        <button
          type="button"
          onClick={() => latestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
          aria-label="Jump to latest step"
          className="sticky bottom-4 self-end ml-auto inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 28, padding: '0 12px',
            background: 'var(--color-bg-surface)',
            border: '1px solid rgba(124,140,248,0.35)',
            borderRadius: 999, color: 'var(--color-accent)',
            fontSize: 11, fontFamily: 'var(--font-mono)',
            cursor: 'pointer', float: 'right', marginTop: 8,
          }}
        >
          <ArrowDown style={{ width: 11, height: 11 }} aria-hidden="true" /> Latest
        </button>
      )}
    </div>
  );
}
