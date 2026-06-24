import type { ClaudeModel } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import { modelPricing } from '../llm/provider-registry.js';

const log = createLogger('token-tracker');

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  baselineCostUsd: number;
}

interface RunTokenState {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalBaselineCostUsd: number;
  stepUsages: Map<string, TokenUsage>;
}

const runStates = new Map<string, RunTokenState>();

/**
 * Opsiyonel cost override — middleware tarafından sağlandığında token×fiyat
 * yaklaşımı yerine bunlar kullanılır (router downgrade, cache hit, prompt cache
 * gibi etmenleri yansıtır).
 */
interface CostOverride {
  actualCostUsd?: number;
  baselineCostUsd?: number;
}

export const tokenTracker = {
  initRun(runId: string): void {
    runStates.set(runId, {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalBaselineCostUsd: 0,
      stepUsages: new Map(),
    });
  },

  async recordUsage(
    runId: string,
    stepId: string,
    model: ClaudeModel,
    inputTokens: number,
    outputTokens: number,
    providerId?: string | null,
    override?: CostOverride,
  ): Promise<TokenUsage> {
    let state = runStates.get(runId);
    if (!state) {
      this.initRun(runId);
      state = runStates.get(runId)!;
    }

    // Cost-layer'dan geldiyse onu kullan; yoksa istenen-model fiyatı × token sayısı.
    const { costPer1kInput, costPer1kOutput } = await modelPricing(providerId, model);
    const approxCost = (inputTokens / 1000) * costPer1kInput + (outputTokens / 1000) * costPer1kOutput;
    const costUsd = override?.actualCostUsd ?? approxCost;
    const baselineCostUsd = override?.baselineCostUsd ?? approxCost;

    const usage: TokenUsage = { inputTokens, outputTokens, costUsd, baselineCostUsd };
    state.stepUsages.set(stepId, usage);

    state.totalInputTokens += inputTokens;
    state.totalOutputTokens += outputTokens;
    state.totalCostUsd += costUsd;
    state.totalBaselineCostUsd += baselineCostUsd;

    log.info(`Run ${runId} step ${stepId}: ${inputTokens} in / ${outputTokens} out / $${costUsd.toFixed(4)} (baseline $${baselineCostUsd.toFixed(4)})`);

    return usage;
  },

  getRunTotals(runId: string): { totalInputTokens: number; totalOutputTokens: number; totalCostUsd: number; totalBaselineCostUsd: number } {
    const state = runStates.get(runId);
    if (!state) {
      return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, totalBaselineCostUsd: 0 };
    }
    return {
      totalInputTokens: state.totalInputTokens,
      totalOutputTokens: state.totalOutputTokens,
      totalCostUsd: state.totalCostUsd,
      totalBaselineCostUsd: state.totalBaselineCostUsd,
    };
  },

  cleanupRun(runId: string): void {
    runStates.delete(runId);
  },
};
