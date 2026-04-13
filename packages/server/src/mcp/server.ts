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
import { activityRepo } from '../db/repositories/activity.repo.js';
import { eventBus } from '../utils/event-bus.js';
import { createLogger } from '../utils/logger.js';
import { buildAgentContextBlock, buildOrchestratorPrompt } from '../utils/prompt-adapter.js';
import { buildMemoryBlock } from '../engine/context-builder.js';
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
    'Karmaşık bir görevi tüm agent takımına dağıt ve execute et. Orchestrator rolünü üstlenerek görevi alt görevlere böl, her biri için ask_agent çağır, sonuçları birleştir.',
    {
      query: z.string().describe('Gerçekleştirmek istediğin görev veya hedef'),
      context: z.string().optional().describe('Ek bağlam, mevcut kod, dosya içerikleri (isteğe bağlı)'),
    },
    async ({ query, context }) => {
      const agents = getCachedAgents(projectId);
      const orchestrator = agents.find((a) => a.role === 'orchestrator');
      const specialists = agents.filter((a) => a.role === 'specialist');

      if (!orchestrator) {
        return {
          content: [{ type: 'text', text: 'Bu projede orchestrator agent tanımlanmamış. Proje ayarlarından bir orchestrator ekle.' }],
        };
      }

      if (specialists.length === 0) {
        return {
          content: [{ type: 'text', text: 'Bu projede henüz specialist agent tanımlanmamış.' }],
        };
      }

      // Log orchestrator activity
      const activity = activityRepo.create({ projectId, agentId: orchestrator.id, type: 'mcp_call', query });
      eventBus.emitProjectEvent(projectId, { type: 'agent:started', agentId: orchestrator.id, activityId: activity.id, query });
      setTimeout(() => {
        activityRepo.complete(activity.id, 'completed');
        eventBus.emitProjectEvent(projectId, { type: 'agent:completed', agentId: orchestrator.id, activityId: activity.id });
      }, 3000);

      // Build agent list for the orchestrator
      const agentList = specialists
        .map((a) =>
          `- **${a.name}** | ID: \`${a.id}\`${a.description ? ` | ${a.description}` : ''}`,
        )
        .join('\n');

      // Find documentation agent for final step
      const docAgent = specialists.find(
        (a) => a.name.toLowerCase().includes('doc') || a.slug.toLowerCase().includes('doc'),
      );
      const docInstruction = docAgent
        ? `\n5. Tüm görevler tamamlandıktan sonra \`ask_agent\` ile Documentation agent'ı çağır (ID: \`${docAgent.id}\`). Tüm çıktıları özetle ve bir rapor oluştur. Raporu \`run-report.txt\` olarak workspace'e kaydet.`
        : '';

      const userContent = context ? `${context}\n\n${query}` : query;

      const orchestrationPrompt = buildOrchestratorPrompt(
        orchestrator,
        userContent,
        agentList,
        docInstruction,
      );

      return {
        content: [{ type: 'text', text: orchestrationPrompt }],
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

      // Log activity
      const activity = activityRepo.create({ projectId, agentId: agent.id, type: 'mcp_call', query });
      eventBus.emitProjectEvent(projectId, { type: 'agent:started', agentId: agent.id, activityId: activity.id, query });

      // Auto-complete after response is sent
      setTimeout(() => {
        activityRepo.complete(activity.id, 'completed');
        eventBus.emitProjectEvent(projectId, { type: 'agent:completed', agentId: agent.id, activityId: activity.id });
      }, 2000);

      return {
        content: [{
          type: 'text',
          text: buildAgentContextBlock(agent, query, context, buildMemoryBlock(agent.id)),
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
