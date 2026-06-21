import { createLogger } from '../utils/logger.js';
import type { ClaudeModel } from '@subagent/shared';
import { costMiddleware } from '../cost/middleware.js';
import type { CallMeta, Classifier, Executor } from '../cost/types.js';
import { complete as llmComplete } from '../llm/client.js';
import { modelPricing, resolveProvider } from '../llm/provider-registry.js';

const log = createLogger('claude');

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCallParams {
  model: ClaudeModel;
  /** Provider serving this model (built-in or custom). Absent/null → resolved by id heuristic. */
  providerId?: string | null;
  maxTokens: number;
  temperature?: number;
  systemPrompt?: string;
  messages: ClaudeMessage[];
  stopSequences?: string[];
  /** Cost-layer meta verisi (namespace, cacheable, callKind...). Opsiyonel — geriye dönük uyumlu. */
  meta?: CallMeta;
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHit: boolean;
  servedModel: ClaudeModel;
  /** Router kademesi (varsa) — gateway usage kaydı için. */
  routerTier: string | null;
  /** Gerçek maliyet ($USD) — router/cache sonrası. */
  actualCostUsd: number;
  /** Cost-layer olmasaydı maliyet ($USD) — savings hesabı için. */
  baselineCostUsd: number;
  /** L0 compression ile kazanılan input token. */
  compressionSavedTokens: number;
}

/**
 * Provider-agnostic LLM service. Despite the historical name, this is no longer tied to
 * the Anthropic SDK — it routes every call through the cost-layer middleware to the
 * unified client ([llm/client.ts]), which dispatches to the resolved provider
 * (Anthropic, OpenAI, Gemini, or any custom OpenAI-/Anthropic-compatible endpoint).
 */
/** Map a call result to the run_steps breakdown columns (model + cost-layer fields). */
export function stepBreakdownFields(result: ClaudeCallResult, providerId?: string | null) {
  return {
    model: result.servedModel,
    providerId: providerId ?? null,
    cacheHit: result.cacheHit,
    routerTier: result.routerTier,
    cacheReadTokens: result.cacheReadInputTokens,
    cacheCreationTokens: result.cacheCreationInputTokens,
    compressionSavedTokens: result.compressionSavedTokens,
  };
}

export class ClaudeService {
  // apiKey kept for call-site compatibility; the unified client resolves keys per provider.
  constructor(_apiKey?: string) {}

  async sendMessage(params: ClaudeCallParams): Promise<ClaudeCallResult> {
    return this.run(params, false);
  }

  async streamMessage(
    params: ClaudeCallParams,
    onChunk?: (chunk: string) => void,
  ): Promise<ClaudeCallResult> {
    return this.run(params, true, onChunk);
  }

  private async run(
    params: ClaudeCallParams,
    stream: boolean,
    onChunk?: (chunk: string) => void,
  ): Promise<ClaudeCallResult> {
    const resolved = resolveProvider(params.providerId, params.model);
    const pricing = modelPricing(params.providerId, params.model);

    const result = await costMiddleware.complete(
      {
        model: params.model,
        providerId: params.providerId ?? undefined,
        providerKind: resolved.kind,
        pricing,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        stopSequences: params.stopSequences,
        meta: stream ? { ...(params.meta ?? {}), isStream: true } : (params.meta ?? {}),
      },
      { executor: this.buildExecutor(stream), classify: this.buildClassifier() },
      onChunk,
    );

    return {
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      stopReason: result.stopReason,
      cacheCreationInputTokens: result.cacheCreationInputTokens,
      cacheReadInputTokens: result.cacheReadInputTokens,
      cacheHit: result.cacheHit,
      servedModel: result.servedModel,
      routerTier: result.routerTier ?? null,
      actualCostUsd: result.actualCostUsd,
      baselineCostUsd: result.baselineCostUsd,
      compressionSavedTokens: result.compressionSavedTokens,
    };
  }

  /** Executor: performs the real provider call via the unified client. */
  private buildExecutor(stream: boolean): Executor {
    return async (req, onChunk) => {
      log.info(`Dispatching to ${req.model} (maxTokens: ${req.maxTokens})`);
      const r = await llmComplete(
        {
          providerId: req.providerId,
          model: req.model,
          maxTokens: req.maxTokens,
          temperature: req.temperature,
          systemPrompt: req.systemPrompt,
          systemBlocks: req.systemBlocks,
          messages: req.messages,
          stopSequences: req.stopSequences,
        },
        stream ? onChunk : undefined,
      );
      return {
        text: r.text,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheCreationInputTokens: r.cacheCreationInputTokens,
        cacheReadInputTokens: r.cacheReadInputTokens,
        stopReason: r.stopReason,
      };
    };
  }

  /**
   * L2 router classification call. providerId router tarafından geçilir (provider-agnostic);
   * undefined kalırsa registry built-in heuristic ile çözer. Cost middleware'den geçmez —
   * classifier'ın kendisi router'a / cache'e sokulmaz.
   */
  private buildClassifier(): Classifier {
    return async ({ model, providerId, maxTokens, systemPrompt, userMessage }) => {
      const r = await llmComplete({
        providerId,
        model,
        maxTokens,
        temperature: 0,
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      return { text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    };
  }
}
