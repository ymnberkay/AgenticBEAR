/**
 * MCP LLM Service — thin wrapper over the unified LLM client ([llm/client.ts]).
 * Kept for backwards-compatible call sites (ask_agent, routing classification).
 * Provider/model resolution, multi-provider dispatch (incl. custom OpenAI-/Anthropic-
 * compatible providers) and usage normalization now live in the unified client + registry.
 */
import type { ModelConfig } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import { complete } from '../llm/client.js';

const log = createLogger('mcp:llm');

export interface LLMCallParams {
  modelConfig: ModelConfig;
  systemPrompt: string;
  userMessage: string;
}

/** Returns the assistant text. Throws on provider/key errors (callers handle fallback). */
export async function callLLM(params: LLMCallParams): Promise<string> {
  const { modelConfig, systemPrompt, userMessage } = params;
  try {
    const result = await complete({
      providerId: modelConfig.providerId,
      model: modelConfig.model,
      maxTokens: modelConfig.maxTokens ?? 8192,
      temperature: modelConfig.temperature ?? 0.7,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return result.text;
  } catch (error) {
    log.error(`LLM call failed for model ${modelConfig.model}`, error);
    throw error;
  }
}
