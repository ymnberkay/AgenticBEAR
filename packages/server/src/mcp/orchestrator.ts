/**
 * MCP Orchestrator — query routing engine
 * İki strateji: keyword matching (hızlı, offline) ve LLM classification (akıllı)
 * LLM classification başarısız olursa keyword'e fallback yapar.
 */
import type { Agent } from '@subagent/shared';
import { DEFAULT_MODEL_CONFIG } from '@subagent/shared';
import { callLLM } from './llm-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mcp:orchestrator');

/**
 * Gelen sorguyu en uygun specialist agent'a yönlendir.
 * Orchestrator mevcutsa LLM classification dener, yoksa keyword matching kullanır.
 */
export async function routeToAgent(
  orchestrator: Agent | undefined,
  specialists: Agent[],
  query: string,
): Promise<Agent> {
  if (specialists.length === 0) {
    throw new Error('Projede hiç specialist agent bulunamadı.');
  }

  if (specialists.length === 1) {
    return specialists[0];
  }

  // LLM classification — orchestrator varsa ve system prompt'u doluysa
  if (orchestrator?.systemPrompt) {
    try {
      return await routeViaLLM(orchestrator, specialists, query);
    } catch (err) {
      log.warn('LLM routing başarısız, keyword matching\'e geçiliyor', err);
    }
  }

  return routeViaKeyword(specialists, query);
}

async function routeViaLLM(
  orchestrator: Agent,
  specialists: Agent[],
  query: string,
): Promise<Agent> {
  const agentList = specialists
    .map((a) => `- ID: "${a.id}" | İsim: ${a.name} | Açıklama: ${a.description || 'Yok'}`)
    .join('\n');

  const classifyPrompt =
    `Aşağıdaki kullanıcı sorgusunu mevcut agentlar arasından en uygununa yönlendir.\n\n` +
    `Mevcut agentlar:\n${agentList}\n\n` +
    `Kullanıcı sorgusu: "${query}"\n\n` +
    `SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:\n` +
    `{"agentId": "<seçilen_agent_id>", "confidence": 0.95, "reasoning": "Kısa açıklama"}`;

  const response = await callLLM({
    modelConfig: orchestrator.modelConfig ?? DEFAULT_MODEL_CONFIG,
    systemPrompt: orchestrator.systemPrompt,
    userMessage: classifyPrompt,
  });

  // JSON'ı response'dan çıkar — markdown code block içinde gelebilir
  const jsonMatch = response.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error(`LLM geçerli JSON döndürmedi. Response: ${response.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as { agentId: string; reasoning?: string };
  const selected = specialists.find((a) => a.id === parsed.agentId);

  if (!selected) {
    throw new Error(`LLM bilinmeyen agent ID döndürdü: "${parsed.agentId}"`);
  }

  log.info(`LLM routing → ${selected.name} | Reasoning: ${parsed.reasoning ?? 'belirtilmemiş'}`);
  return selected;
}

function routeViaKeyword(specialists: Agent[], query: string): Agent {
  const queryLower = query.toLowerCase();
  let bestAgent = specialists[0];
  let bestScore = 0;

  for (const agent of specialists) {
    let score = 0;

    // Agent adındaki kelimeler (yüksek ağırlık)
    for (const word of agent.name.toLowerCase().split(/\s+/)) {
      if (word.length > 2 && queryLower.includes(word)) score += 3;
    }

    // Açıklamadaki kelimeler (orta ağırlık)
    if (agent.description) {
      for (const word of agent.description.toLowerCase().split(/\s+/)) {
        if (word.length > 3 && queryLower.includes(word)) score += 1.5;
      }
    }

    // System prompt'taki anlamlı kelimeler (düşük ağırlık)
    for (const word of agent.systemPrompt.toLowerCase().split(/\s+/)) {
      if (word.length > 6 && queryLower.includes(word)) score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  log.info(`Keyword routing → ${bestAgent.name} (skor: ${bestScore})`);
  return bestAgent;
}
