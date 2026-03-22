import { estimateCost } from '@subagent/shared';
import type { ClaudeModel } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('token-tracker');

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface RunTokenState {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  stepUsages: Map<string, TokenUsage>;
}

const runStates = new Map<string, RunTokenState>();

export const tokenTracker = {
  initRun(runId: string): void {
    runStates.set(runId, {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      stepUsages: new Map(),
    });
  },

  recordUsage(
    runId: string,
    stepId: string,
    model: ClaudeModel,
    inputTokens: number,
    outputTokens: number,
  ): TokenUsage {
    let state = runStates.get(runId);
    if (!state) {
      this.initRun(runId);
      state = runStates.get(runId)!;
    }

    const costUsd = estimateCost(model, inputTokens, outputTokens);

    const usage: TokenUsage = { inputTokens, outputTokens, costUsd };
    state.stepUsages.set(stepId, usage);

    state.totalInputTokens += inputTokens;
    state.totalOutputTokens += outputTokens;
    state.totalCostUsd += costUsd;

    log.info(`Run ${runId} step ${stepId}: ${inputTokens} in / ${outputTokens} out / $${costUsd.toFixed(4)}`);

    return usage;
  },

  getRunTotals(runId: string): { totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number } {
    const state = runStates.get(runId);
    if (!state) {
      return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 };
    }
    return {
      totalInputTokens: state.totalInputTokens,
      totalOutputTokens: state.totalOutputTokens,
      totalCostUsd: state.totalCostUsd,
    };
  },

  cleanupRun(runId: string): void {
    runStates.delete(runId);
  },
};
