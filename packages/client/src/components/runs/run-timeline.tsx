import type { RunStep, Agent } from '@subagent/shared';
import { RunStepCard } from './run-step-card';
import { HandoffIndicator } from './handoff-indicator';
import { Skeleton } from '../ui/skeleton';

interface RunTimelineProps {
  steps: RunStep[] | undefined;
  agents: Agent[] | undefined;
  isLoading: boolean;
}

export function RunTimeline({ steps, agents, isLoading }: RunTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-text-tertiary">
        No steps recorded yet. Start a run to see the timeline.
      </div>
    );
  }

  const agentMap = new Map(agents?.map((a) => [a.id, a]));

  return (
    <div className="relative flex flex-col overflow-hidden">
      {/* Vertical connector line */}
      <div
        className="absolute left-[23px] top-4 bottom-4 w-px"
        style={{ background: 'var(--color-border-subtle)' }}
      />

      {steps.map((step, i) => {
        const agent = agentMap.get(step.agentId);
        const prevStep = i > 0 ? steps[i - 1] : null;
        const isHandoff = prevStep && prevStep.agentId !== step.agentId;

        return (
          <div key={step.id}>
            {isHandoff && (
              <HandoffIndicator
                fromAgent={agentMap.get(prevStep!.agentId)}
                toAgent={agent}
              />
            )}
            <RunStepCard step={step} agent={agent} />
          </div>
        );
      })}
    </div>
  );
}
