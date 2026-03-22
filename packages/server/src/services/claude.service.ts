import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.js';
import type { ClaudeModel } from '@subagent/shared';

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
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export class ClaudeService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async sendMessage(params: ClaudeCallParams): Promise<ClaudeCallResult> {
    try {
      log.info(`Sending message to ${params.model} (maxTokens: ${params.maxTokens})`);

      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stop_sequences: params.stopSequences,
      });

      const textContent = response.content
        .filter((block) => block.type === 'text')
        .map((block) => {
          if (block.type === 'text') return block.text;
          return '';
        })
        .join('');

      return {
        text: textContent,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      log.error('Claude API call failed', error);
      throw error;
    }
  }

  async streamMessage(
    params: ClaudeCallParams,
    onChunk?: (chunk: string) => void,
  ): Promise<ClaudeCallResult> {
    try {
      log.info(`Streaming message to ${params.model} (maxTokens: ${params.maxTokens})`);

      const stream = this.client.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stop_sequences: params.stopSequences,
      });

      let fullText = '';

      stream.on('text', (text) => {
        fullText += text;
        onChunk?.(text);
      });

      const finalMessage = await stream.finalMessage();

      return {
        text: fullText,
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        stopReason: finalMessage.stop_reason,
      };
    } catch (error) {
      log.error('Claude streaming call failed', error);
      throw error;
    }
  }
}
