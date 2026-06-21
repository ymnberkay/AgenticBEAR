/**
 * Cost metrikleri — oturum boyu toplam + son N çağrı.
 * Token sayıları GERÇEK usage'dan gelir, tahmin değil.
 * Her çağrı middleware tarafından otomatik kaydedilir; çağıranın bir şey yapması gerekmez.
 */
import type { ClaudeModel } from '@subagent/shared';
import type { RouterTier } from './config.js';
import { costConfig } from './config.js';

export interface CostEntry {
  ts: string;
  role?: string;
  requestedModel: ClaudeModel;
  servedModel: ClaudeModel;
  cacheHit: boolean;
  routerTier: RouterTier | null;
  /** L3 prompt-cache breakpoint'i bu çağrıda gerçekten kondu mu (debug görünürlüğü). */
  promptCacheApplied: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Router sınıflandırma çağrısının kendi token maliyeti (küçük ama görünür). */
  routerOverheadTokens: number;
  /** L0 compression: input tokens saved by compressing context before the call (counterfactual). */
  compressionSavedTokens?: number;
  actualCostUsd: number;
  baselineCostUsd: number;
}

export interface CostStats {
  session: {
    calls: number;
    semanticCacheHits: number;
    semanticCacheMisses: number;
    routerTierCounts: Record<RouterTier | 'NONE', number>;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
      routerOverhead: number;
      compressionSaved: number;
    };
    cost: {
      baselineUsd: number;
      actualUsd: number;
      savedUsd: number;
      savedPct: number;
    };
  };
  recent: CostEntry[];
}

class CostMetrics {
  private entries: CostEntry[] = [];
  private session = {
    calls: 0,
    semanticCacheHits: 0,
    semanticCacheMisses: 0,
    routerTierCounts: { TRIVIAL: 0, SIMPLE: 0, COMPLEX: 0, NONE: 0 } as Record<
      RouterTier | 'NONE',
      number
    >,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    routerOverhead: 0,
    compressionSaved: 0,
    baselineUsd: 0,
    actualUsd: 0,
  };

  record(entry: CostEntry): void {
    this.session.calls += 1;
    if (entry.cacheHit) this.session.semanticCacheHits += 1;
    else this.session.semanticCacheMisses += 1;

    this.session.routerTierCounts[entry.routerTier ?? 'NONE'] += 1;

    this.session.input += entry.inputTokens;
    this.session.output += entry.outputTokens;
    this.session.cacheRead += entry.cacheReadInputTokens;
    this.session.cacheCreation += entry.cacheCreationInputTokens;
    this.session.routerOverhead += entry.routerOverheadTokens;
    this.session.compressionSaved += entry.compressionSavedTokens ?? 0;
    this.session.baselineUsd += entry.baselineCostUsd;
    this.session.actualUsd += entry.actualCostUsd;

    this.entries.push(entry);
    const cap = Math.max(1, costConfig.metrics.lastN);
    if (this.entries.length > cap) {
      this.entries.splice(0, this.entries.length - cap);
    }
  }

  getStats(): CostStats {
    const baseline = this.session.baselineUsd;
    const actual = this.session.actualUsd;
    const saved = baseline - actual;
    const savedPct = baseline > 0 ? (saved / baseline) * 100 : 0;

    return {
      session: {
        calls: this.session.calls,
        semanticCacheHits: this.session.semanticCacheHits,
        semanticCacheMisses: this.session.semanticCacheMisses,
        routerTierCounts: { ...this.session.routerTierCounts },
        tokens: {
          input: this.session.input,
          output: this.session.output,
          cacheRead: this.session.cacheRead,
          cacheCreation: this.session.cacheCreation,
          routerOverhead: this.session.routerOverhead,
          compressionSaved: this.session.compressionSaved,
        },
        cost: {
          baselineUsd: round(baseline),
          actualUsd: round(actual),
          savedUsd: round(saved),
          savedPct: Math.round(savedPct * 10) / 10,
        },
      },
      recent: [...this.entries].reverse(),
    };
  }

  /** Test ve oturum sıfırlama için. */
  reset(): void {
    this.entries = [];
    this.session = {
      calls: 0,
      semanticCacheHits: 0,
      semanticCacheMisses: 0,
      routerTierCounts: { TRIVIAL: 0, SIMPLE: 0, COMPLEX: 0, NONE: 0 },
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      routerOverhead: 0,
      compressionSaved: 0,
      baselineUsd: 0,
      actualUsd: 0,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export const costMetrics = new CostMetrics();
