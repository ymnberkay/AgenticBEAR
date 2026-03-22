/**
 * MCP LLM Service — model-agnostic completion layer
 * Provider'ı model adından otomatik algılar.
 * Desteklenen: Anthropic (Claude), OpenAI (GPT-4o, o-series), Gemini
 * API key çözümleme sırası: Settings DB → Environment variable
 */
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { createLogger } from '../utils/logger.js';
import type { ModelConfig } from '@subagent/shared';

const log = createLogger('mcp:llm');

export interface LLMCallParams {
  modelConfig: ModelConfig;
  systemPrompt: string;
  userMessage: string;
}

type Provider = 'anthropic' | 'openai' | 'gemini';

function detectProvider(model: string): Provider {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'openai'; // gpt-4o, gpt-4o-mini, o1, o3, o3-mini
}

async function resolveApiKey(provider: Provider): Promise<string> {
  if (provider === 'anthropic') {
    const settings = settingsRepo.getSettings();
    if (settings.apiKey) return settings.apiKey;
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;
    throw new Error(
      'Anthropic API key bulunamadı. Settings sayfasından API key\'i girin veya ANTHROPIC_API_KEY env var\'ını ayarlayın.',
    );
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (key) return key;
    throw new Error(
      'OpenAI API key bulunamadı. OPENAI_API_KEY environment variable\'ını ayarlayın.',
    );
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (key) return key;
    throw new Error(
      'Gemini API key bulunamadı. GEMINI_API_KEY environment variable\'ını ayarlayın.',
    );
  }

  throw new Error(`Desteklenmeyen provider: ${provider}`);
}

async function callAnthropic(params: LLMCallParams, apiKey: string): Promise<string> {
  const { modelConfig, systemPrompt, userMessage } = params;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens ?? 8192,
      temperature: modelConfig.temperature ?? 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API hatası (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function callOpenAI(params: LLMCallParams, apiKey: string): Promise<string> {
  const { modelConfig, systemPrompt, userMessage } = params;

  const body: Record<string, unknown> = {
    model: modelConfig.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  // o-series models don't support temperature
  const isOModel = /^o\d/.test(modelConfig.model);
  if (!isOModel && modelConfig.temperature !== undefined) {
    body.temperature = modelConfig.temperature;
  }
  if (modelConfig.maxTokens !== undefined) {
    body.max_completion_tokens = modelConfig.maxTokens;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API hatası (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}

async function callGemini(params: LLMCallParams, apiKey: string): Promise<string> {
  const { modelConfig, systemPrompt, userMessage } = params;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        ...(modelConfig.temperature !== undefined && { temperature: modelConfig.temperature }),
        ...(modelConfig.maxTokens !== undefined && { maxOutputTokens: modelConfig.maxTokens }),
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API hatası (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  return data.candidates[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

export async function callLLM(params: LLMCallParams): Promise<string> {
  const provider = detectProvider(params.modelConfig.model);
  log.info(`LLM call — model: ${params.modelConfig.model}, provider: ${provider}`);

  try {
    const apiKey = await resolveApiKey(provider);
    switch (provider) {
      case 'anthropic': return await callAnthropic(params, apiKey);
      case 'openai': return await callOpenAI(params, apiKey);
      case 'gemini': return await callGemini(params, apiKey);
    }
  } catch (error) {
    log.error(`LLM call failed for model ${params.modelConfig.model}`, error);
    throw error;
  }
}
