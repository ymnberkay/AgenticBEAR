/**
 * Agentic tool-use loop. Runs an agent with workspace file tools (and, for orchestrators,
 * a delegate tool) until it stops requesting tools, then returns the final text.
 *
 * - File writes auto-apply to the project workspace (sandboxed).
 * - Tool-use steps bypass the cost-layer cache/router (side effects) but ARE cost-recorded.
 * - Depth-limited delegation (orchestrator → specialist, specialist no further) + iteration cap.
 */
import type { Agent } from '@subagent/shared';
import { completeWithTools, type ChatTurn, type ToolDef, type ToolCompletionResult } from '../llm/tool-client.js';
import { modelPricing } from '../llm/provider-registry.js';
import { costMetrics } from '../cost/metrics.js';
import { costConfig } from '../cost/config.js';
import { poolFor, levelOf, priceOf, selectForComplexity, cheapest, parseComplexity, COMPLEXITY_CLASSIFY_SYSTEM } from '../cost/layers/model-select.js';
import { minimizeDirective } from '../cost/layers/output-minimize.js';
import * as semanticCache from '../cost/layers/semantic-cache.js';
import type { LlmRequest, LlmResult, Classifier } from '../cost/types.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { withProjectKnowledge } from './knowledge.service.js';
import { createLogger } from '../utils/logger.js';
import { fileToolDefs, executeFileTool, FILE_TOOL_NAMES } from './agent-tools.js';

const log = createLogger('agent-loop');
const MAX_ITERS = 10;
const MAX_DEPTH = 1;
const DELEGATE = 'delegate_to_agent';

export type LoopEvent =
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'toolResult'; name: string; summary: string }
  | { type: 'write'; path: string; previousContent: string | null; content: string; operation: 'create' | 'modify'; agentId: string }
  | { type: 'delegate'; agent: string; task: string }
  | { type: 'text'; delta: string };

export interface RunTurnOpts {
  agent: Agent;
  projectId: string;
  workspacePath: string;
  /** Conversation so far (user/assistant turns). For a single task, pass one user turn. */
  messages: ChatTurn[];
  depth?: number;
  onEvent?: (e: LoopEvent) => void;
}

export interface RunTurnResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** L0 input tokens saved by lossless compression across the whole turn (for analytics). */
  compressionSavedTokens: number;
  iterations: number;
  filesWritten: Array<{ path: string; previousContent: string | null; content: string; operation: 'create' | 'modify'; agentId: string }>;
  /** Model actually used after L2 level-routing (may be cheaper than the agent's configured model). */
  servedModel: string;
  servedProviderId?: string;
  /** L2 router tier this turn ('TRIVIAL'|'SIMPLE' = downgraded, 'COMPLEX' = kept, null = not routed). */
  routerTier: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | null;
  /** Actual cost (served model) and what it would have cost on the agent's configured model. */
  costUsd: number;
  baselineCostUsd: number;
  /** True when the whole answer was served from the L1 semantic cache (no LLM call). */
  cacheHit: boolean;
}

/**
 * L2 level-routing for an agentic task: classify the task complexity once and pick the cheapest
 * model in the agent's provider pool whose level meets it, capped at the agent's configured model.
 * Runs the whole tool loop on the chosen model (picked once → never changes mid-loop, so
 * tool-calling stays reliable).
 */
async function pickModelForTask(
  agent: Agent,
  userText: string,
): Promise<{ model: string; providerId?: string; tier: RunTurnResult['routerTier'] }> {
  const requested = { model: agent.modelConfig.model, providerId: agent.modelConfig.providerId ?? undefined };
  if (!costConfig.layers.router) return { ...requested, tier: null };

  const pool = poolFor(undefined, requested.providerId, requested.model);
  const ceiling = levelOf(pool, requested.providerId, requested.model);
  if (!pool.some((c) => c.level < ceiling)) return { ...requested, tier: null }; // nothing cheaper
  const ceilingPrice = priceOf(pool, requested.providerId, requested.model);
  if (ceilingPrice > 0 && ceilingPrice < costConfig.router.minCeilingPrice) return { ...requested, tier: null };

  const classifier = cheapest(pool);
  if (!classifier) return { ...requested, tier: null };

  let complexity: number;
  try {
    const res = await completeWithTools(
      {
        providerId: classifier.providerId, model: classifier.model,
        maxTokens: costConfig.router.classifierMaxTokens, temperature: 0,
        systemPrompt: COMPLEXITY_CLASSIFY_SYSTEM,
        messages: [{ role: 'user', content: userText.slice(0, 2000) }],
      },
      [],
    );
    complexity = parseComplexity(res.text);
  } catch {
    return { ...requested, tier: null };
  }

  const sel = selectForComplexity(pool, requested, complexity);
  if (!sel.downgraded) return { ...requested, tier: 'COMPLEX' };
  return { model: sel.model, providerId: sel.providerId, tier: complexity <= 2 ? 'TRIVIAL' : 'SIMPLE' };
}

/**
 * `isCoordinator` → the agent only delegates (no file tools): it must route work to specialists.
 * Otherwise the agent gets the workspace file tools and does the work itself.
 */
function toolGuidance(workspacePath: string, isCoordinator: boolean): string {
  if (isCoordinator) {
    return (
      `## Your role: COORDINATOR\n` +
      `You do NOT edit files or write code yourself — you have no file tools. ` +
      `Your only tool is \`delegate_to_agent(agent, task)\`.\n` +
      `For the user's request: break it into concrete subtasks and delegate EACH to the right ` +
      `specialist (e.g. backend work → the backend agent, frontend → the frontend agent, docs → the docs agent). ` +
      `Their results return to you. When all subtasks are done, synthesize a short final summary of what the team produced. ` +
      `Never claim a file was written unless a specialist reported writing it.`
    );
  }
  return (
    `## Workspace Tools\n` +
    `You can act on the project workspace at \`${workspacePath}\` using tools:\n` +
    `- \`write_file(path, content)\` — create/modify files (paths RELATIVE to the workspace)\n` +
    `- \`read_file(path)\` — inspect a file\n` +
    `- \`list_files()\` — see the structure\n` +
    `When asked to build or change code, ACTUALLY write the files with write_file — do not just describe them. ` +
    `Read before overwriting when unsure. When finished, give a short summary of what you did.`
  );
}

function delegateToolDef(specialists: Agent[]): ToolDef {
  return {
    name: DELEGATE,
    description: `Delegate a subtask to a specialist agent and get its result. agent must be one of: ${specialists.map((s) => s.slug).join(', ')}`,
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: `Specialist slug (${specialists.map((s) => s.slug).join(' | ')})` },
        task: { type: 'string', description: 'Clear, self-contained task description for the specialist' },
      },
      required: ['agent', 'task'],
    },
  };
}

/** Record one tool-use step; actual = served-model cost, baseline = agent's configured-model cost. */
function recordCost(
  agent: Agent,
  served: { model: string; providerId?: string },
  res: ToolCompletionResult,
  tier: RunTurnResult['routerTier'],
): { actual: number; baseline: number } {
  const reqP = modelPricing(agent.modelConfig.providerId, agent.modelConfig.model);
  const srvP = modelPricing(served.providerId, served.model);
  const baseline = (res.inputTokens / 1000) * reqP.costPer1kInput + (res.outputTokens / 1000) * reqP.costPer1kOutput;
  const actual = (res.inputTokens / 1000) * srvP.costPer1kInput + (res.outputTokens / 1000) * srvP.costPer1kOutput;
  costMetrics.record({
    ts: new Date().toISOString(),
    role: agent.role,
    requestedModel: agent.modelConfig.model,
    servedModel: served.model,
    cacheHit: false,
    routerTier: tier,
    promptCacheApplied: false,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    routerOverheadTokens: 0,
    compressionSavedTokens: res.compressionSavedTokens,
    actualCostUsd: actual,
    baselineCostUsd: baseline,
  });
  return { actual, baseline };
}

function lastUserText(messages: ChatTurn[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) return messages[i].content as string;
  }
  return messages.map((m) => m.content ?? '').join('\n');
}

/**
 * L1 answer-cache for agentic turns. SAFE because we only ever STORE turns that used NO tools
 * (pure answers, no side effects) — so a hit can never skip a needed file write. Keyed/namespaced
 * per agent + prompt, with the same threshold + judge gate as the gateway cache.
 */
function cacheRequestFor(agent: Agent, systemPrompt: string, messages: ChatTurn[]): LlmRequest {
  return {
    model: agent.modelConfig.model,
    providerId: agent.modelConfig.providerId ?? undefined,
    maxTokens: agent.modelConfig.maxTokens,
    temperature: agent.modelConfig.temperature,
    systemPrompt,
    messages: messages
      .filter((m): m is ChatTurn & { content: string } => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    meta: { role: agent.role, agentSlug: agent.slug, cacheable: true, callKind: 'agent' },
  };
}

/** A judge (for the cache's uncertain band) that reuses the agentic LLM path. */
const cacheJudge: Classifier = async ({ model, providerId, maxTokens, systemPrompt, userMessage }) => {
  const r = await completeWithTools(
    { providerId, model, maxTokens, temperature: 0, systemPrompt, messages: [{ role: 'user', content: userMessage }] },
    [],
  );
  return { text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
};

export async function runAgentTurn(opts: RunTurnOpts): Promise<RunTurnResult> {
  const { agent, projectId, workspacePath, depth = 0, onEvent } = opts;
  const messages: ChatTurn[] = [...opts.messages];

  const canDelegate = agent.role === 'orchestrator' && depth < MAX_DEPTH;
  const specialists = canDelegate
    ? agentRepo.findByProjectId(projectId).filter((a) => a.role === 'specialist')
    : [];
  // A coordinator (orchestrator with specialists to delegate to) ONLY delegates — no file tools,
  // so it must route work to specialists instead of doing it itself. Everyone else gets file tools.
  const isCoordinator = canDelegate && specialists.length > 0;
  const tools: ToolDef[] = isCoordinator ? [delegateToolDef(specialists)] : [...fileToolDefs()];

  // L4 — append the output-minimization directive (off by default) to trim output tokens.
  const minimize = minimizeDirective();
  const systemPrompt = [withProjectKnowledge(agent.systemPrompt, projectId), toolGuidance(workspacePath, isCoordinator), minimize]
    .filter(Boolean)
    .join('\n\n');

  // L1 — answer cache (depth 0 only). Safe: only no-tool answers are ever stored, so a hit
  // can never skip a needed file write. A hit returns immediately (no LLM, no router).
  const cacheReq = cacheRequestFor(agent, systemPrompt, messages);
  const cacheOn = depth === 0 && costConfig.layers.semanticCache && semanticCache.isCacheable(cacheReq);
  if (cacheOn) {
    let hit: LlmResult | null = null;
    try { hit = await semanticCache.lookup(cacheReq, cacheJudge); } catch { hit = null; }
    if (hit) {
      if (hit.text) onEvent?.({ type: 'text', delta: hit.text });
      const { costPer1kInput, costPer1kOutput } = modelPricing(agent.modelConfig.providerId, agent.modelConfig.model);
      const baseline = ((hit.baselineInputTokens ?? 0) / 1000) * costPer1kInput + ((hit.baselineOutputTokens ?? 0) / 1000) * costPer1kOutput;
      costMetrics.record({
        ts: new Date().toISOString(), role: agent.role,
        requestedModel: agent.modelConfig.model, servedModel: hit.servedModel,
        cacheHit: true, routerTier: null, promptCacheApplied: false,
        inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
        routerOverheadTokens: 0, compressionSavedTokens: 0, actualCostUsd: 0, baselineCostUsd: baseline,
      });
      log.info(`Agent "${agent.name}" L1 answer-cache hit`);
      return {
        text: hit.text, inputTokens: 0, outputTokens: 0, compressionSavedTokens: 0, iterations: 0,
        filesWritten: [], servedModel: hit.servedModel, servedProviderId: agent.modelConfig.providerId ?? undefined,
        routerTier: null, costUsd: 0, baselineCostUsd: baseline, cacheHit: true,
      };
    }
  }

  // L2 — pick the model for this task by complexity (once), capped at the agent's configured model.
  const picked = await pickModelForTask(agent, lastUserText(opts.messages));
  const served = { model: picked.model, providerId: picked.providerId };
  if (picked.tier === 'TRIVIAL' || picked.tier === 'SIMPLE') {
    log.info(`Agent "${agent.name}" routed ${agent.modelConfig.model} → ${served.model} (${picked.tier})`);
  }

  let totalIn = 0;
  let totalOut = 0;
  let totalComp = 0;
  let totalActual = 0;
  let totalBaseline = 0;
  const filesWritten: RunTurnResult['filesWritten'] = [];
  let toolUsed = false;
  const base = (): Omit<RunTurnResult, 'text' | 'iterations'> => ({
    inputTokens: totalIn, outputTokens: totalOut, compressionSavedTokens: totalComp, filesWritten,
    servedModel: served.model, servedProviderId: served.providerId, routerTier: picked.tier,
    costUsd: totalActual, baselineCostUsd: totalBaseline, cacheHit: false,
  });

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const res = await completeWithTools(
      {
        providerId: served.providerId,
        model: served.model,
        maxTokens: agent.modelConfig.maxTokens,
        temperature: agent.modelConfig.temperature,
        systemPrompt,
        messages,
      },
      tools,
    );
    totalIn += res.inputTokens;
    totalOut += res.outputTokens;
    totalComp += res.compressionSavedTokens;
    const c = recordCost(agent, served, res, picked.tier);
    totalActual += c.actual;
    totalBaseline += c.baseline;

    if (res.toolCalls.length === 0) {
      if (res.text) onEvent?.({ type: 'text', delta: res.text });
      // Pure answer (no tool used the whole turn) → safe to cache for next time.
      if (cacheOn && !toolUsed && res.text) {
        const stored: LlmResult = {
          text: res.text, inputTokens: totalIn, outputTokens: totalOut,
          cacheCreationInputTokens: 0, cacheReadInputTokens: 0, stopReason: 'end_turn',
          requestedModel: agent.modelConfig.model, servedModel: served.model, cacheHit: false,
          routerTier: null, actualCostUsd: totalActual, baselineCostUsd: totalBaseline, compressionSavedTokens: totalComp,
        };
        void semanticCache.store(cacheReq, stored).catch(() => {});
      }
      return { text: res.text, iterations: iter + 1, ...base() };
    }
    toolUsed = true;

    messages.push({ role: 'assistant', content: res.text || undefined, toolCalls: res.toolCalls });

    for (const tc of res.toolCalls) {
      onEvent?.({ type: 'tool', name: tc.name, args: tc.args });
      let resultStr: string;

      if (tc.name === DELEGATE) {
        const ref = String(tc.args.agent ?? '');
        const spec = specialists.find((s) => s.slug === ref || s.id === ref || s.name === ref);
        if (!spec) {
          resultStr = `No such specialist: "${ref}". Available: ${specialists.map((s) => s.slug).join(', ')}`;
        } else {
          const task = String(tc.args.task ?? '');
          onEvent?.({ type: 'delegate', agent: spec.name, task });
          const sub = await runAgentTurn({ agent: spec, projectId, workspacePath, messages: [{ role: 'user', content: task }], depth: depth + 1, onEvent });
          filesWritten.push(...sub.filesWritten);
          totalIn += sub.inputTokens;
          totalOut += sub.outputTokens;
          totalComp += sub.compressionSavedTokens;
          totalActual += sub.costUsd;
          totalBaseline += sub.baselineCostUsd;
          resultStr = sub.text || '(no output)';
        }
      } else if (FILE_TOOL_NAMES.has(tc.name)) {
        if (isCoordinator) {
          // A coordinator has no file tools — never let it touch the workspace itself; force delegation.
          resultStr = `You are a coordinator and cannot use ${tc.name}. Delegate this to a specialist with delegate_to_agent instead.`;
        } else {
          const exec = executeFileTool(workspacePath, tc.name, tc.args);
          resultStr = exec.result;
          if (exec.write) {
            const w = { ...exec.write, agentId: agent.id };
            filesWritten.push(w);
            onEvent?.({ type: 'write', ...w });
          }
        }
      } else {
        resultStr = `Unknown tool: ${tc.name}`;
      }

      onEvent?.({ type: 'toolResult', name: tc.name, summary: resultStr.slice(0, 200) });
      messages.push({ role: 'tool', toolCallId: tc.id, content: resultStr });
    }
  }

  log.warn(`Agent "${agent.name}" hit the ${MAX_ITERS}-iteration tool limit`);
  return { text: '(Reached the tool-iteration limit before finishing.)', iterations: MAX_ITERS, ...base() };
}
