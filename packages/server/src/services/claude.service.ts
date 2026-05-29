import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.js';
import type { ClaudeModel } from '@subagent/shared';
import { costMiddleware } from '../cost/middleware.js';
import type { CallMeta, Classifier, Executor, FinalRequest } from '../cost/types.js';

const log = createLogger('claude');

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCallParams {
  model: ClaudeModel;
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
  /** Cost katmanı zenginleştirmeleri (varsayılan değerlerle her zaman dolu). */
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHit: boolean;
  servedModel: ClaudeModel;
}

export class ClaudeService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Choke-point: tüm normal (non-stream) çağrılar cost-layer middleware'inden geçer.
   * Katmanlar kapalıyken executor istenen istekle birebir aynı SDK çağrısını yapar.
   */
  async sendMessage(params: ClaudeCallParams): Promise<ClaudeCallResult> {
    const result = await costMiddleware.complete(
      {
        model: params.model,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        stopSequences: params.stopSequences,
        meta: params.meta ?? {},
      },
      { executor: this.buildExecutor(false), classify: this.buildClassifier() },
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
    };
  }

  /**
   * Streaming choke-point. Cache hit varsa tam metin tek chunk olarak yayınlanır;
   * miss ise gerçek streaming executor üzerinden akar.
   */
  async streamMessage(
    params: ClaudeCallParams,
    onChunk?: (chunk: string) => void,
  ): Promise<ClaudeCallResult> {
    const result = await costMiddleware.complete(
      {
        model: params.model,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        stopSequences: params.stopSequences,
        meta: { ...(params.meta ?? {}), isStream: true },
      },
      { executor: this.buildExecutor(true), classify: this.buildClassifier() },
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
    };
  }

  /**
   * L2 router'ın kısa sınıflandırma çağrısı. DOĞRUDAN SDK'ya gider —
   * cost-layer middleware'inden GEÇMEZ (özyineleme ve gereksiz cache/router olmaz).
   */
  private buildClassifier(): Classifier {
    return async ({ model, maxTokens, systemPrompt, userMessage }) => {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    };
  }

  /** Gerçek SDK çağrısını yapan executor. Middleware nihai isteği verir. */
  private buildExecutor(stream: boolean): Executor {
    return async (req: FinalRequest, onChunk?: (chunk: string) => void) => {
      // L3 systemBlocks doldurduysa onu, yoksa düz systemPrompt'u kullan.
      const system: Anthropic.MessageCreateParams['system'] =
        req.systemBlocks ?? req.systemPrompt;

      const body: Anthropic.MessageCreateParamsNonStreaming = {
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        stop_sequences: req.stopSequences,
      };

      if (stream) {
        log.info(`Streaming message to ${req.model} (maxTokens: ${req.maxTokens})`);
        const s = this.client.messages.stream(body);
        let fullText = '';
        s.on('text', (text) => {
          fullText += text;
          onChunk?.(text);
        });
        const final = await s.finalMessage();
        return {
          text: fullText,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cacheCreationInputTokens: final.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: final.usage.cache_read_input_tokens ?? 0,
          stopReason: final.stop_reason,
        };
      }

      log.info(`Sending message to ${req.model} (maxTokens: ${req.maxTokens})`);
      const response = await this.client.messages.create(body);
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        stopReason: response.stop_reason,
      };
    };
  }
}
