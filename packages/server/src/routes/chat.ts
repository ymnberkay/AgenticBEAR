/**
 * Project chat — converse with an agent that can ACT: it has workspace file tools
 * (write/read/list) and, for an orchestrator, a delegate tool. Streams tool activity + the
 * final answer over SSE. File writes auto-apply to the project workspace and are recorded.
 *
 *   POST /api/projects/:projectId/chat   { agentId, messages: [{role, content}] }   → SSE
 *
 * SSE frames: {delta}, {tool}, {toolResult}, {write}, {delegate}, {done}, then `data: [DONE]`.
 */
import type { FastifyInstance } from 'fastify';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { runRepo } from '../db/repositories/run.repo.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import { runAgentTurn, type RunTurnResult } from '../services/agent-loop.service.js';
import type { ChatTurn } from '../llm/tool-client.js';
import { createLogger } from '../utils/logger.js';
import type { Agent } from '@subagent/shared';

const log = createLogger('chat');

interface ChatBody {
  agentId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Persist a chat turn (+ any file writes) as a synthetic run so it shows in Analytics + workspace. */
function recordChatStep(projectId: string, agent: Agent, lastUser: string, result: RunTurnResult): void {
  try {
    // L2 level-routing may have served a cheaper model than configured → record both for savings.
    const cost = result.costUsd;
    const baseline = result.baselineCostUsd;
    const objective = `Chat: ${lastUser.length > 60 ? `${lastUser.slice(0, 57)}…` : lastUser}`;
    const run = runRepo.create({ projectId, objective });
    const now = new Date().toISOString();
    const task = taskRepo.createTask({ runId: run.id, assignedAgentId: agent.id, title: 'Chat', description: lastUser });
    const stepRow = taskRepo.createStep({
      runId: run.id, taskId: task.id, agentId: agent.id, type: 'api_call',
      input: lastUser, output: result.text,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      costUsd: cost, baselineCostUsd: baseline, durationMs: 0,
      model: result.servedModel, providerId: result.servedProviderId ?? agent.modelConfig.providerId, cacheHit: result.cacheHit,
      routerTier: result.routerTier, compressionSavedTokens: result.compressionSavedTokens,
    });
    for (const f of result.filesWritten) {
      taskRepo.createFileChange({
        runStepId: stepRow.id, runId: run.id, filePath: f.path, operation: f.operation,
        previousContent: f.previousContent, newContent: f.content, agentId: f.agentId,
      });
    }
    taskRepo.updateTask(task.id, { status: 'completed', output: result.text, completedAt: now });
    runRepo.update(run.id, {
      status: 'completed', startedAt: now, completedAt: now,
      totalInputTokens: result.inputTokens, totalOutputTokens: result.outputTokens,
      totalCostUsd: cost, totalBaselineCostUsd: baseline,
    });
  } catch (err) {
    log.warn('chat analytics record failed (non-fatal)', err);
  }
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: ChatBody }>(
    '/api/projects/:projectId/chat',
    async (request, reply) => {
      const { projectId } = request.params;
      const { agentId, messages } = request.body ?? ({} as ChatBody);

      if (!agentId || !Array.isArray(messages) || messages.length === 0) {
        return reply.status(400).send({ error: true, message: 'agentId and a non-empty messages array are required' });
      }
      const agent = agentRepo.findById(agentId);
      if (!agent || agent.projectId !== projectId) {
        return reply.status(404).send({ error: true, message: 'Agent not found in this project' });
      }
      const project = projectRepo.findById(projectId);
      if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });

      const turns: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);

      try {
        const result = await runAgentTurn({
          agent, projectId, workspacePath: project.workspacePath, messages: turns,
          onEvent: (e) => {
            if (e.type === 'tool') send({ tool: { name: e.name, args: e.args } });
            else if (e.type === 'toolResult') send({ toolResult: { name: e.name, summary: e.summary } });
            else if (e.type === 'write') send({ write: { path: e.path, operation: e.operation } });
            else if (e.type === 'delegate') send({ delegate: { agent: e.agent, task: e.task } });
            else if (e.type === 'text') send({ delta: e.delta });
          },
        });
        recordChatStep(projectId, agent, lastUser, result);
        send({ done: true, servedModel: result.servedModel, filesWritten: result.filesWritten.length });
        raw.write('data: [DONE]\n\n');
        raw.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('chat failed', err);
        send({ error: msg });
        raw.end();
      }
      return reply;
    },
  );
}
