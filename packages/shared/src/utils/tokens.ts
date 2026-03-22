import { CLAUDE_MODELS } from '../constants/models.js';
import type { ClaudeModel } from '../types/agent.js';

export function estimateCost(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = CLAUDE_MODELS[model];
  if (!pricing) return 0;
  return (
    (inputTokens / 1000) * pricing.costPer1kInput +
    (outputTokens / 1000) * pricing.costPer1kOutput
  );
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
