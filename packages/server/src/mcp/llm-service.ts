/**
 * MCP LLM Service — routes MCP calls (ask_agent, ask_orchestrator, routing) through the
 * cost-layer middleware via ClaudeService, so the MCP path gets the SAME cost optimization
 * (L1 semantic cache, L2 router, L3 prompt cache) + metrics as the run engine — not just
 * provider routing. Provider/model resolution + multi-provider dispatch live downstream.
 */
import type { ModelConfig } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';
import { ClaudeService } from '../services/claude.service.js';
import type { CallMeta } from '../cost/types.js';

const log = createLogger('mcp:llm');

export interface LLMCallParams {
  modelConfig: ModelConfig;
  systemPrompt: string;
  userMessage: string;
  /** Cost-layer meta (namespace, cacheable, callKind). Optional. */
  meta?: CallMeta;
}

/** Returns the assistant text. Throws on provider/key errors (callers handle fallback). */
export async function callLLM(params: LLMCallParams): Promise<string> {
  const { modelConfig, systemPrompt, userMessage, meta } = params;
  try {
    const service = new ClaudeService();
    const result = await service.sendMessage({
      model: modelConfig.model,
      providerId: modelConfig.providerId,
      maxTokens: modelConfig.maxTokens ?? 8192,
      temperature: modelConfig.temperature ?? 0.7,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      meta,
    });
    return result.text;
  } catch (error) {
    log.error(`LLM call failed for model ${modelConfig.model}`, error);
    throw error;
  }
}
