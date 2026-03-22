/**
 * MCP Server Factory — proje başına bir MCP server instance üretir
 * 4 tool: ask_orchestrator, ask_agent, list_agents, multi_agent_discuss
 *
 * Mimari: Server LLM çağrısı YAPMAZ. Agent'ın sistem promptunu ve soruyu
 * formatlanmış şekilde döner — Claude Code CLI kendi session'ıyla yanıtlar.
 * API key gerekmez, kullanıcının kendi Claude Code tokenları kullanılır.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { createLogger } from '../utils/logger.js';
import type { Agent } from '@subagent/shared';

const log = createLogger('mcp:server');

// Proje başına 30 saniyelik agent cache
const agentCache = new Map<string, { agents: Agent[]; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

function getCachedAgents(projectId: string): Agent[] {
  const cached = agentCache.get(projectId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.agents;
  }
  const agents = agentRepo.findByProjectId(projectId);
  agentCache.set(projectId, { agents, timestamp: Date.now() });
  return agents;
}

/** Cache'i temizle — agent veya proje güncellendiğinde çağrılır */
export function invalidateMcpCache(projectId: string): void {
  agentCache.delete(projectId);
  log.info(`Cache invalidated — project: ${projectId}`);
}

/**
 * Keyword matching ile en uygun specialist agent'ı bul.
 * Orchestrator LLM çağrısı yapmadan basit skor hesaplar.
 */
function routeByKeyword(specialists: Agent[], query: string): Agent {
  const q = query.toLowerCase();
  let best = specialists[0];
  let bestScore = 0;

  for (const agent of specialists) {
    let score = 0;
    for (const word of agent.name.toLowerCase().split(/\s+/)) {
      if (word.length > 2 && q.includes(word)) score += 3;
    }
    if (agent.description) {
      for (const word of agent.description.toLowerCase().split(/\s+/)) {
        if (word.length > 3 && q.includes(word)) score += 1.5;
      }
    }
    for (const word of agent.systemPrompt.toLowerCase().split(/\s+/)) {
      if (word.length > 6 && q.includes(word)) score += 0.5;
    }
    if (score > bestScore) { bestScore = score; best = agent; }
  }

  log.info(`Keyword routing → ${best.name} (skor: ${bestScore})`);
  return best;
}

/** Agent'ın kimliğini ve sistem promptunu Claude Code'a aktaran blok */
function agentContextBlock(agent: Agent, query: string, context?: string): string {
  const userContent = context ? `${context}\n\n${query}` : query;
  return (
    `<agent_instructions>\n` +
    `Sen şu anda "${agent.name}" rolündesin.\n` +
    (agent.description ? `Rol açıklaması: ${agent.description}\n` : '') +
    `\nSistem talimatların:\n${agent.systemPrompt}\n` +
    `</agent_instructions>\n\n` +
    `Yukarıdaki talimatlar çerçevesinde aşağıdaki soruyu yanıtla:\n\n${userContent}`
  );
}

/** Belirtilen proje için MCP server oluştur */
export function createMcpServer(projectId: string): McpServer {
  const project = projectRepo.findById(projectId);
  if (!project) throw new Error(`Proje bulunamadı: ${projectId}`);

  const server = new McpServer({
    name: `AgenticBEAR — ${project.name}`,
    version: '1.0.0',
  });

  // ── ask_orchestrator ────────────────────────────────────────────────────────
  server.tool(
    'ask_orchestrator',
    'Soruyu en uygun agent\'a otomatik yönlendir. Hangi agent\'ı kullanacağını bilmiyorsan bu aracı kullan. Yönlendirilen agent\'ın kimliğini ve talimatlarını döner — sen yanıtlarsın.',
    {
      query: z.string().describe('Sormak istediğin soru veya görev'),
      context: z.string().optional().describe('Ek bağlam, kod parçası veya dosya içeriği (isteğe bağlı)'),
    },
    async ({ query, context }) => {
      const agents = getCachedAgents(projectId);
      const specialists = agents.filter((a) => a.role === 'specialist');

      if (specialists.length === 0) {
        return {
          content: [{ type: 'text', text: 'Bu projede henüz specialist agent tanımlanmamış.' }],
        };
      }

      const target = routeByKeyword(specialists, query);

      return {
        content: [{
          type: 'text',
          text: agentContextBlock(target, query, context),
        }],
      };
    },
  );

  // ── ask_agent ───────────────────────────────────────────────────────────────
  server.tool(
    'ask_agent',
    'Belirtilen agent\'ın kimliğini ve talimatlarını yükle, soruyu o agent gibi yanıtla. Agent ID\'sini bilmiyorsan önce list_agents çağır.',
    {
      agent_id: z.string().describe('Agent\'ın ID değeri'),
      query: z.string().describe('Sormak istediğin soru veya görev'),
      context: z.string().optional().describe('Ek bağlam, kod parçası veya dosya içeriği (isteğe bağlı)'),
    },
    async ({ agent_id, query, context }) => {
      const agents = getCachedAgents(projectId);
      const agent = agents.find((a) => a.id === agent_id);

      if (!agent) {
        const list = agents
          .map((a) => `• \`${a.id}\` — **${a.name}** (${a.role})`)
          .join('\n');
        return {
          content: [{
            type: 'text',
            text: `Agent bulunamadı: \`${agent_id}\`\n\nMevcut agentlar:\n${list}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: agentContextBlock(agent, query, context),
        }],
      };
    },
  );

  // ── list_agents ─────────────────────────────────────────────────────────────
  server.tool(
    'list_agents',
    'Projedeki tüm agentları, rollerini ve açıklamalarını listele.',
    {},
    async () => {
      const agents = getCachedAgents(projectId);

      if (agents.length === 0) {
        return {
          content: [{ type: 'text', text: `"${project.name}" projesinde henüz agent tanımlanmamış.` }],
        };
      }

      const lines = agents.map((a) =>
        `### ${a.name} \`(${a.role})\`\n` +
        `- **ID:** \`${a.id}\`\n` +
        `- **Model:** ${a.modelConfig.model}\n` +
        (a.description ? `- **Açıklama:** ${a.description}\n` : ''),
      );

      return {
        content: [{
          type: 'text',
          text: `## ${project.name} — Agentlar (${agents.length} adet)\n\n${lines.join('\n')}`,
        }],
      };
    },
  );

  // ── multi_agent_discuss ─────────────────────────────────────────────────────
  server.tool(
    'multi_agent_discuss',
    'Birden fazla agent\'ın talimatlarını aynı anda yükle. Her agent\'ın perspektifinden sırayla yanıt vermeni sağlar.',
    {
      agent_ids: z.array(z.string()).min(2).describe('Dahil edilecek agent ID\'leri (en az 2)'),
      topic: z.string().describe('Tüm agentların tartışacağı konu veya soru'),
    },
    async ({ agent_ids, topic }) => {
      const agents = getCachedAgents(projectId);

      const sections: string[] = [];

      for (const id of agent_ids) {
        const agent = agents.find((a) => a.id === id);
        if (!agent) {
          sections.push(`### ❌ \`${id}\` — Agent bulunamadı`);
          continue;
        }
        sections.push(
          `### ${agent.name}\n` +
          `**Sistem talimatları:** ${agent.systemPrompt}\n\n` +
          `Bu agent olarak "${topic}" konusunda görüşünü belirt.`,
        );
      }

      return {
        content: [{
          type: 'text',
          text:
            `## Multi-Agent Tartışma — ${topic}\n\n` +
            `Aşağıdaki her agent için sırayla, o agent\'ın kimliğini ve talimatlarını benimseyerek yanıt ver:\n\n---\n\n` +
            sections.join('\n\n---\n\n'),
        }],
      };
    },
  );

  return server;
}
