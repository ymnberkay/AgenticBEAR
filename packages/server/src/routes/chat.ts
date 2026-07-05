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
import { runAgentTurn, type RunTurnResult, type ApprovalRequest, type ApprovalDecision } from '../services/agent-loop.service.js';
import { awaitApproval, rejectApprovals, resolveApproval } from '../services/approval-registry.service.js';
import { resolveProjectWorkspace } from '../services/git-workspace.service.js';
import { callExternalAgent, type ExternalMessage } from '../services/external-agent.service.js';
import type { ChatTurn } from '../llm/tool-client.js';
import { createLogger } from '../utils/logger.js';
import type { Agent, User, FileChange } from '@subagent/shared';
import type { AuthedRequest } from '../middleware/require-auth.js';
import { resolveGroupForUser, checkCombinedQuota, recordCombinedUsage, quotaExceededMessage } from '../services/quota.service.js';
import { activityLogRepo } from '../db/repositories/activity-log.repo.js';
import { markStreamOpen, markStreamClosed } from '../services/session-activity.js';

const log = createLogger('chat');

/** How long an interactive approval prompt waits for the user before auto-rejecting (loop resumes). */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;

/** Client-shape image attachment. Data-URIs are the only allowed shape (base64). */
interface ChatImage { dataUrl: string; name?: string }
/** Client-shape audio attachment (mic recording or audio file). Data-URI only. */
interface ChatAudio { dataUrl: string; name?: string }
/** Client-shape video attachment. Data-URI only. */
interface ChatVideo { dataUrl: string; name?: string }

interface ChatBody {
  agentId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Attachments for the CURRENT (last) user message. Ignored for external agents that don't
   *  support images. Silently discarded for orchestrator/specialist agents (no vision path v1). */
  images?: ChatImage[];
  /** Audio clips for the CURRENT (last) user message — external agents with supportsAudio only. */
  audio?: ChatAudio[];
  /** Video clips for the CURRENT (last) user message — external agents with supportsVideo only. */
  video?: ChatVideo[];
}

/** data:audio/webm;base64,… → OpenAI input_audio {data, format}; null when not a data-URI. */
function audioPart(dataUrl: string): { type: 'input_audio'; input_audio: { data: string; format: string } } | null {
  const m = /^data:audio\/([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { type: 'input_audio', input_audio: { data: m[2]!, format: m[1]! } };
}

/**
 * Persist a chat turn (+ any file writes) as a synthetic run so it shows in Analytics + workspace.
 * Applied writes are recorded as 'applied'; chat-staged ops are recorded as 'pending' and returned
 * so the route can surface Approve/Reject to the user.
 */
async function recordChatStep(projectId: string, agent: Agent, lastUser: string, result: RunTurnResult, attribution: { userId?: string | null; username?: string | null; groupId?: string | null }): Promise<FileChange[]> {
  const pending: FileChange[] = [];
  try {
    // L2 level-routing may have served a cheaper model than configured → record both for savings.
    const cost = result.costUsd;
    const baseline = result.baselineCostUsd;
    const objective = `Chat: ${lastUser.length > 60 ? `${lastUser.slice(0, 57)}…` : lastUser}`;
    const run = await runRepo.create({ projectId, objective }, attribution);
    const now = new Date().toISOString();
    const task = await taskRepo.createTask({ runId: run.id, assignedAgentId: agent.id, title: 'Chat', description: lastUser });
    const stepRow = await taskRepo.createStep({
      runId: run.id, taskId: task.id, agentId: agent.id, type: 'api_call',
      input: lastUser, output: result.text,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      costUsd: cost, baselineCostUsd: baseline, durationMs: 0,
      model: result.servedModel, providerId: result.servedProviderId ?? agent.modelConfig.providerId, cacheHit: result.cacheHit,
      routerTier: result.routerTier, compressionSavedTokens: result.compressionSavedTokens,
    });
    for (const f of result.filesWritten) {
      await taskRepo.createFileChange({
        runStepId: stepRow.id, runId: run.id, filePath: f.path, operation: f.operation,
        previousContent: f.previousContent, newContent: f.content, agentId: f.agentId,
      });
    }
    for (const f of result.pendingWrites) {
      pending.push(await taskRepo.createFileChange({
        runStepId: stepRow.id, runId: run.id, filePath: f.path, operation: f.operation,
        previousContent: f.previousContent, newContent: f.content, agentId: f.agentId, status: 'pending',
      }));
    }
    await taskRepo.updateTask(task.id, { status: 'completed', output: result.text, completedAt: now });
    await runRepo.update(run.id, {
      status: 'completed', startedAt: now, completedAt: now,
      totalInputTokens: result.inputTokens, totalOutputTokens: result.outputTokens,
      totalCostUsd: cost, totalBaselineCostUsd: baseline,
    });
  } catch (err) {
    log.warn('chat analytics record failed (non-fatal)', err);
  }
  return pending;
}

/** The project's Documentation agent, if one exists (by template, then name/slug heuristic). */
export async function findDocumentationAgent(projectId: string): Promise<Agent | undefined> {
  const agents = await agentRepo.findByProjectId(projectId);
  return (
    agents.find((a) => a.templateId === 'tmpl_documentation') ??
    agents.find((a) => /document/i.test(a.name) || /document/i.test(a.slug))
  );
}

interface AutoDocArgs {
  projectId: string;
  project: import('@subagent/shared').Project;
  chattedAgent: Agent;
  lastUser: string;
  result: RunTurnResult;
  attribution: { userId?: string | null; username?: string | null; groupId?: string | null };
  send: (obj: unknown) => void;
  /** Same interactive-approval callback as the main turn (the doc write pauses for approval too). */
  requestApproval?: (req: ApprovalRequest) => Promise<ApprovalDecision>;
}

/**
 * After a change-making chat turn, run the project's Documentation agent to record what changed —
 * staged for approval alongside the code. Best-effort: never breaks the main turn. Returns the
 * doc's pending file changes (so the caller can surface them in the approval bar).
 */
async function maybeAutoDocument(args: AutoDocArgs): Promise<FileChange[]> {
  const { projectId, project, chattedAgent, lastUser, result, attribution, send, requestApproval } = args;
  // Only when actual FILE changes were applied this turn (commands don't need docs).
  const fileChanges = result.filesWritten.filter((w) => w.operation !== 'command');
  if (fileChanges.length === 0) return [];

  try {
    const docAgent = await findDocumentationAgent(projectId);
    if (!docAgent || docAgent.id === chattedAgent.id) return []; // none, or we ARE the doc agent

    send({ tool: { name: 'documenting' } }); // live "Documenting changes" activity chip
    const changeList = fileChanges.map((w) => `- ${w.operation} ${w.path}`).join('\n');
    const docTask =
      `The team just made these changes to the project:\n${changeList}\n\n` +
      `User request: ${lastUser}\nWorker summary: ${result.text || '(none)'}\n\n` +
      `Create or update a concise documentation file (prefer updating README.md, else docs/CHANGES.md) ` +
      `recording WHAT changed and WHY. Use write_file. Keep it brief.`;

    const docResult = await runAgentTurn({
      agent: docAgent, projectId, workspacePath: resolveProjectWorkspace(project),
      messages: [{ role: 'user', content: docTask }],
      label: 'Document changes', requestApproval,
      onEvent: (e) => {
        // Surface the doc agent's tool activity + staged file, but NOT its prose (keep the main answer clean).
        if (e.type === 'tool') send({ tool: { name: e.name, args: e.args } });
        else if (e.type === 'toolResult') send({ toolResult: { name: e.name, summary: e.summary } });
        else if (e.type === 'pendingWrite') send({ pendingWrite: { path: e.path, operation: e.operation } });
      },
    });

    const docPending = await recordChatStep(projectId, docAgent, 'Document changes', docResult, attribution);
    await recordCombinedUsage(attribution.userId ?? null, attribution.groupId ?? null, docResult.inputTokens, docResult.outputTokens, docResult.costUsd);
    return docPending;
  } catch (err) {
    log.warn('auto-documentation failed (non-fatal)', err);
    return [];
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
      const agent = await agentRepo.findById(agentId);
      if (!agent || agent.projectId !== projectId) {
        return reply.status(404).send({ error: true, message: 'Agent not found in this project' });
      }
      const project = await projectRepo.findById(projectId);
      if (!project) return reply.status(404).send({ error: true, message: 'Project not found' });

      // ── Token quota (personal + shared group pool) — block before doing any work ──
      const user = (request as AuthedRequest).authUser as User | undefined;
      const groupId = await resolveGroupForUser(user, projectId);
      const quota = await checkCombinedQuota(user?.id ?? null, groupId);
      if (!quota.allowed) {
        return reply.status(429).send({ error: true, message: quotaExceededMessage(quota) });
      }

      const turns: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const images = Array.isArray(request.body?.images) ? request.body!.images : [];
      const audio = Array.isArray(request.body?.audio) ? request.body!.audio : [];
      const video = Array.isArray(request.body?.video) ? request.body!.video : [];

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (obj: unknown) => raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      markStreamOpen();
      raw.once('close', markStreamClosed);

      // ── External agent branch — role='external' bypasses the internal tool loop and proxies to the team's endpoint ──
      if (agent.role === 'external') {
        try {
          // Rehydrate the secret alongside the agent (already have the row via findById, need withSecret).
          const agentWithSecret = await agentRepo.findByIdWithSecret(agent.id);
          if (!agentWithSecret) {
            send({ error: { message: 'External agent could not be loaded.' } });
            raw.write('data: [DONE]\n\n');
            raw.end();
            return;
          }
          // Attach images/audio/video to the LAST user turn only, using OpenAI multimodal shape.
          const wantImages = images.length > 0 && agentWithSecret.external?.supportsImages;
          const wantAudio = audio.length > 0 && agentWithSecret.external?.supportsAudio;
          const wantVideo = video.length > 0 && agentWithSecret.external?.supportsVideo;
          const extMessages: ExternalMessage[] = messages.map((m, i) => {
            const isLastUser = i === messages.length - 1 && m.role === 'user' && (wantImages || wantAudio || wantVideo);
            if (!isLastUser) return { role: m.role, content: m.content };
            const parts = [
              { type: 'text' as const, text: m.content },
              ...(wantImages ? images.map((im) => ({ type: 'image_url' as const, image_url: { url: im.dataUrl } })) : []),
              ...(wantAudio ? audio.map((a) => audioPart(a.dataUrl)).filter((p): p is NonNullable<typeof p> => p !== null) : []),
              ...(wantVideo ? video.map((v) => ({ type: 'video_url' as const, video_url: { url: v.dataUrl } })) : []),
            ];
            return { role: m.role, content: parts };
          });
          await callExternalAgent({
            agent: agentWithSecret,
            messages: extMessages,
            systemPrompt: agent.systemPrompt || undefined,
            wantStream: agentWithSecret.external?.supportsStreaming ?? true,
            onDelta: (delta) => send({ delta }),
            onError: (message) => send({ error: { message } }),
          });
          await activityLogRepo.record({
            projectId, userId: user?.id, username: user?.username, action: 'chat.external',
            target: agent.name, detail: lastUser.length > 120 ? `${lastUser.slice(0, 117)}…` : lastUser,
          });
        } catch (err) {
          log.error('external agent chat failed', err);
          send({ error: { message: err instanceof Error ? err.message : 'External agent failed' } });
        } finally {
          send({ done: true, servedModel: agent.external?.defaultModel || agent.name, filesWritten: 0, pending: 0 });
          raw.write('data: [DONE]\n\n');
          raw.end();
        }
        return;
      }

      // ── Interactive (human-in-the-loop) approval — pause the turn on a destructive tool, ask the
      //    user, then resume with the real result. Pending decisions are auto-rejected if the client
      //    disconnects so the loop never hangs. ──
      const pendingApprovalIds = new Set<string>();
      const requestApproval = async (req: ApprovalRequest): Promise<ApprovalDecision> => {
        pendingApprovalIds.add(req.callId);
        send({ approvalRequest: { callId: req.callId, tool: req.tool, operation: req.operation, label: req.label, command: req.command, path: req.path, contentPreview: req.contentPreview } });
        const decision = await awaitApproval(req.callId, APPROVAL_TIMEOUT_MS);
        pendingApprovalIds.delete(req.callId);
        send({ approvalResolved: { callId: req.callId, approved: decision.approved } });
        return decision;
      };
      raw.on('close', () => rejectApprovals([...pendingApprovalIds]));

      try {
        const result = await runAgentTurn({
          agent, projectId, workspacePath: resolveProjectWorkspace(project), messages: turns,
          label: lastUser,
          requestApproval, // chat pauses on destructive tools for live user approval
          onEvent: (e) => {
            if (e.type === 'tool') send({ tool: { name: e.name, args: e.args } });
            else if (e.type === 'toolResult') send({ toolResult: { name: e.name, summary: e.summary } });
            else if (e.type === 'write') send({ write: { path: e.path, operation: e.operation } });
            else if (e.type === 'pendingWrite') send({ pendingWrite: { path: e.path, operation: e.operation } });
            else if (e.type === 'delegate') send({ delegate: { agent: e.agent, task: e.task } });
            else if (e.type === 'text') send({ delta: e.delta });
          },
        });
        const pending = await recordChatStep(projectId, agent, lastUser, result, { userId: user?.id, username: user?.username, groupId });
        await recordCombinedUsage(user?.id ?? null, groupId, result.inputTokens, result.outputTokens, result.costUsd);
        await activityLogRepo.record({
          projectId, userId: user?.id, username: user?.username, action: 'chat.message',
          target: agent.name, detail: lastUser.length > 120 ? `${lastUser.slice(0, 117)}…` : lastUser,
        });

        // ── Auto-documentation: if this turn proposed FILE changes and the project has a
        //    Documentation agent, have it document them — staged into the same approval batch. ──
        const docPending = await maybeAutoDocument({
          projectId, project, chattedAgent: agent, lastUser, result,
          attribution: { userId: user?.id, username: user?.username, groupId }, send, requestApproval,
        });

        // Surface staged changes (with their ids) so the user can Approve/Reject.
        for (const p of [...pending, ...docPending]) {
          send({ pending: { id: p.id, path: p.filePath, operation: p.operation } });
        }
        send({ done: true, servedModel: result.servedModel, filesWritten: result.filesWritten.length, pending: pending.length + docPending.length });
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

  // ── Interactive approval decision — the client posts a user's Approve/Reject for a paused tool
  //    call; this unblocks the still-open chat turn (see the requestApproval callback above). ──
  app.post<{ Params: { projectId: string; callId: string }; Body: { approved?: boolean } }>(
    '/api/projects/:projectId/chat/approvals/:callId',
    async (request, reply) => {
      const approved = request.body?.approved === true;
      const ok = resolveApproval(request.params.callId, { approved });
      if (!ok) return reply.status(404).send({ error: true, message: 'No pending approval with that id (it may have timed out).' });
      return reply.send({ ok: true, approved });
    },
  );
}
