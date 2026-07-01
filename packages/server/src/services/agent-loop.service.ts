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
import { activityRepo } from '../db/repositories/activity.repo.js';
import { memoryRepo } from '../db/repositories/memory.repo.js';
import { eventBus } from '../utils/event-bus.js';
import { withProjectKnowledge } from './knowledge.service.js';
import { createLogger } from '../utils/logger.js';
import { fileToolDefs, executeFileTool, FILE_TOOL_NAMES } from './agent-tools.js';
import { createProjectIssue } from './issue.service.js';
import { goalRepo } from '../db/repositories/goal.repo.js';
import type { IssueKind, IssuePriority, GoalPriority } from '@subagent/shared';

const log = createLogger('agent-loop');
const MAX_ITERS = 10;
const MAX_DEPTH = 1;
const DELEGATE = 'delegate_to_agent';

// ── Anti-runaway guards ───────────────────────────────────────────────────────
// Each loop iteration re-sends the whole (growing) message history, so without bounds a
// stuck/looping model can balloon to 1M+ input tokens before the iteration cap trips.
/** Hard cap on cumulative INPUT tokens per turn. Once crossed, the next call drops tools to force a final answer. */
const MAX_TURN_INPUT_TOKENS = 200_000;
/** Per-call message-context budget (chars). Older TOOL results beyond this are elided so big file dumps aren't re-billed every iteration. ~30k tokens. */
const MAX_CONTEXT_CHARS = 120_000;
/** Same tool call (name+args) more than this many times → refuse to re-run it (breaks loops). */
const MAX_SAME_CALL = 2;

/** Stable signature for a tool call, for loop detection. */
function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args, Object.keys(args ?? {}).sort())}`;
}

/**
 * Keep the system prompt + recent turns intact, but elide the CONTENT of older `tool` results
 * once the char budget is spent — newest first. Stops the history from re-sending (and re-billing)
 * large file dumps on every iteration, which is the main driver of the 1M-token blowups.
 */
function trimHistory(messages: ChatTurn[]): ChatTurn[] {
  let budget = MAX_CONTEXT_CHARS;
  const out: ChatTurn[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const len = (m.content ?? '').length;
    if (m.role === 'tool' && len > 0 && budget <= 0) {
      out.push({ ...m, content: '[earlier tool result elided to save context]' });
    } else {
      out.push(m);
      budget -= len;
    }
  }
  return out.reverse();
}

type FileOp = 'create' | 'modify' | 'delete' | 'command';
interface FileWrite { path: string; previousContent: string | null; content: string; operation: FileOp; agentId: string }

export type LoopEvent =
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'toolResult'; name: string; summary: string }
  | { type: 'write'; path: string; previousContent: string | null; content: string; operation: FileOp; agentId: string }
  | { type: 'pendingWrite'; path: string; operation: FileOp; agentId: string }
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
  /** Short label for the recorded activity + memory query (defaults to the last user message). */
  label?: string;
  /** Run id to attach to the recorded memory (null/undefined for chat). */
  runId?: string | null;
  /** Chat mode: stage file writes/deletes for user approval instead of applying them to disk. */
  requireApproval?: boolean;
}

export interface RunTurnResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** L0 input tokens saved by lossless compression across the whole turn (for analytics). */
  compressionSavedTokens: number;
  iterations: number;
  filesWritten: FileWrite[];
  /** Chat-staged file ops awaiting user approval (not yet on disk). Empty unless requireApproval. */
  pendingWrites: FileWrite[];
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

  const pool = await poolFor(undefined, requested.providerId, requested.model);
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
 * Identity anchor — pins the agent's name + actual configured model so it answers "which model
 * are you?" correctly. Some models (notably DeepSeek-V3, trained partly on Claude/GPT transcripts)
 * otherwise claim to be "Claude" whenever a system prompt is present. This is a model-self-id quirk,
 * not a routing issue; the anchor keeps the stated identity honest to the configured model.
 */
function identityLine(agent: Agent): string {
  return (
    `## Identity\n` +
    `You are an AI agent named "${agent.name}" running on the model \`${agent.modelConfig.model}\`. ` +
    `If asked which model or provider you are, answer with this exact model id. ` +
    `Do NOT claim to be Claude, GPT, Gemini, or any other model unless that string literally matches your model id above.`
  );
}

/**
 * Response discipline — keep chat answers tight AND stop agents from "deferring": a turn must end
 * with the work actually done (or an honest, final answer), never with "I'm examining…/awaiting
 * results…" which leaves the user thinking work continues when the turn has already ended.
 */
const RESPONSE_DISCIPLINE =
  `## Response discipline\n` +
  `- Do the work NOW with your tools in this same turn; you will not get a later turn to "continue".\n` +
  `- Never reply that you are "examining", "looking into it", "working on it", or "awaiting results". ` +
  `Either perform the action and report the concrete result, or state plainly that you cannot.\n` +
  `- When the request implies a change (add/fix/refactor/update/implement/build/rename/remove), the turn's ` +
  `main output must be the EDITS THEMSELVES via tools — do NOT paste code blocks into chat instead of writing files.\n` +
  `- Keep replies short: a direct answer plus a one-to-three sentence summary of what you actually did/changed. ` +
  `No restating the plan, no filler, no apologies.`;

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
      `For ANY actionable request (add/fix/refactor/update/implement/build): break it into concrete subtasks and ` +
      `delegate EACH to the right specialist who will MAKE the changes (and run builds/tests) — never answer with ` +
      `code or a description instead of delegating. Route by domain (backend → backend agent, frontend → frontend agent, docs → docs agent). ` +
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
    `- \`grep_codebase(pattern, glob?, flags?)\` — regex search across the workspace. Returns file:line + context window per match. **Prefer this over list_files + read_file loops** when you know what you're looking for. Examples: \`grep_codebase("session\\\\.cookie")\`, \`grep_codebase("TODO", "src/**/*.ts")\`.\n` +
    `- \`find_references(symbol, glob?)\` — find every usage of a code symbol (word-boundary matching). Use BEFORE rename/refactor to be sure you catch every caller. Definition lines are marked with [def].\n` +
    `- \`delete_file(path)\` — remove a file\n` +
    `- \`run_command(command)\` — run a shell command in the workspace dir (builds, tests, deps, git, logs), e.g. \`npm run build\`. Synchronous with a timeout — don't start long-lived servers.\n` +
    `- \`create_issue(title, description, kind, priority, labels)\` — file an issue for findings (security vulns, bugs, QA failures, follow-ups). It's recorded in the project and synced to the linked tracker (Jira/GitHub/Azure) if configured; \`labels\` are free-form tags that ride along to the tracker. Security/QA agents: file an issue for each significant finding.\n` +
    `- \`add_project_goal(title, description, priority)\` — record a high-level project objective (what the project should accomplish) so the user can later hand a batch of goals back to the orchestrator. Use this when decomposing a vague request into clear sub-objectives rather than into low-level issues.\n` +
    `**Default to acting.** If the request implies a change (add/fix/refactor/update/implement/build), DO it with ` +
    `\`write_file\`/\`delete_file\`/\`run_command\` — do NOT just describe it or paste code into the chat. ` +
    `Answer in plain prose only for genuine questions where nothing needs to change. ` +
    `Use run_command to compile/test and read the output before reporting success. ` +
    `Read before overwriting when unsure. When finished, give a short (1–3 sentence) summary of what you changed.`
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
async function recordCost(
  agent: Agent,
  served: { model: string; providerId?: string },
  res: ToolCompletionResult,
  tier: RunTurnResult['routerTier'],
): Promise<{ actual: number; baseline: number }> {
  const reqP = await modelPricing(agent.modelConfig.providerId, agent.modelConfig.model);
  const srvP = await modelPricing(served.providerId, served.model);
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
    meta: { role: agent.role, agentSlug: agent.slug, projectId: agent.projectId, cacheable: true, callKind: 'agent' },
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

/**
 * Public entry: records agent **activity** + **memory** around the core loop, so chat-driven
 * agents AND delegated specialists show up in the Activity/Memory tabs and the live Monitor feed.
 * Recording is best-effort (never breaks the turn). The recursion delegates through this wrapper,
 * so each delegated specialist gets its own activity + memory entry.
 */
export async function runAgentTurn(opts: RunTurnOpts): Promise<RunTurnResult> {
  const { agent, projectId } = opts;
  const query = ((opts.label ?? lastUserText(opts.messages) ?? '').trim().slice(0, 2000)) || '(chat)';

  let activityId: string | undefined;
  try {
    const act = await activityRepo.create({ projectId, agentId: agent.id, type: 'direct', query });
    activityId = act.id;
    eventBus.emitProjectEvent(projectId, { type: 'agent:started', agentId: agent.id, activityId: act.id, query });
  } catch { /* recording is best-effort */ }

  let failed = false;
  try {
    const result = await runTurnInner(opts);
    if (result.text) {
      try {
        await memoryRepo.create({ agentId: agent.id, projectId, type: 'interaction', query, response: result.text, runId: opts.runId ?? null });
      } catch { /* best-effort */ }
    }
    return result;
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    if (activityId) {
      try {
        await activityRepo.complete(activityId, failed ? 'failed' : 'completed');
        eventBus.emitProjectEvent(projectId, { type: 'agent:completed', agentId: agent.id, activityId });
      } catch { /* best-effort */ }
    }
  }
}

async function runTurnInner(opts: RunTurnOpts): Promise<RunTurnResult> {
  const { agent, projectId, workspacePath, depth = 0, onEvent } = opts;
  const messages: ChatTurn[] = [...opts.messages];

  const canDelegate = agent.role === 'orchestrator' && depth < MAX_DEPTH;
  const specialists = canDelegate
    ? (await agentRepo.findByProjectId(projectId)).filter((a) => a.role === 'specialist')
    : [];
  // A coordinator (orchestrator with specialists to delegate to) ONLY delegates — no file tools,
  // so it must route work to specialists instead of doing it itself. Everyone else gets file tools.
  const isCoordinator = canDelegate && specialists.length > 0;
  const tools: ToolDef[] = isCoordinator ? [delegateToolDef(specialists)] : [...fileToolDefs()];

  // L4 — append the output-minimization directive (off by default) to trim output tokens.
  const minimize = minimizeDirective();
  const systemPrompt = [identityLine(agent), await withProjectKnowledge(agent.systemPrompt, projectId), toolGuidance(workspacePath, isCoordinator), RESPONSE_DISCIPLINE, minimize]
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
      const { costPer1kInput, costPer1kOutput } = await modelPricing(agent.modelConfig.providerId, agent.modelConfig.model);
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
        filesWritten: [], pendingWrites: [], servedModel: hit.servedModel, servedProviderId: agent.modelConfig.providerId ?? undefined,
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
  const filesWritten: FileWrite[] = [];
  const pendingWrites: FileWrite[] = [];
  let toolUsed = false;
  const base = (): Omit<RunTurnResult, 'text' | 'iterations'> => ({
    inputTokens: totalIn, outputTokens: totalOut, compressionSavedTokens: totalComp, filesWritten, pendingWrites,
    servedModel: served.model, servedProviderId: served.providerId, routerTier: picked.tier,
    costUsd: totalActual, baselineCostUsd: totalBaseline, cacheHit: false,
  });

  const callCounts = new Map<string, number>();
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    // On the last iteration, or once the input-token budget is spent, drop tools so the model
    // MUST return a final text answer instead of spinning up more tool calls (anti-runaway).
    const forceFinal = iter === MAX_ITERS - 1 || totalIn >= MAX_TURN_INPUT_TOKENS;
    if (forceFinal && totalIn >= MAX_TURN_INPUT_TOKENS) {
      log.warn(`Agent "${agent.name}" hit the per-turn input budget (${totalIn} tok) — forcing a final answer`);
    }
    const res = await completeWithTools(
      {
        providerId: served.providerId,
        model: served.model,
        maxTokens: agent.modelConfig.maxTokens,
        temperature: agent.modelConfig.temperature,
        systemPrompt,
        messages: trimHistory(messages),
      },
      forceFinal ? [] : tools,
    );
    totalIn += res.inputTokens;
    totalOut += res.outputTokens;
    totalComp += res.compressionSavedTokens;
    const c = await recordCost(agent, served, res, picked.tier);
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

      // Loop breaker: if the model repeats the exact same call, refuse to re-run it.
      const sig = callSignature(tc.name, tc.args);
      const seen = (callCounts.get(sig) ?? 0) + 1;
      callCounts.set(sig, seen);

      if (seen > MAX_SAME_CALL) {
        resultStr = `You already ran ${tc.name} with identical arguments ${seen - 1} time(s); it will not run again. Continue with different work or give your final answer.`;
      } else if (tc.name === 'create_issue') {
        const title = String(tc.args.title ?? '').trim();
        if (!title) {
          resultStr = 'Error: title is required';
        } else {
          try {
            const rawLabels = tc.args.labels;
            const labels = Array.isArray(rawLabels)
              ? rawLabels.map((x) => String(x ?? '').trim()).filter(Boolean)
              : [];
            const issue = await createProjectIssue(projectId, {
              title,
              description: String(tc.args.description ?? ''),
              kind: (tc.args.kind as IssueKind) ?? 'issue',
              priority: (tc.args.priority as IssuePriority) ?? 'medium',
              labels,
              source: 'agent', agentId: agent.id, runId: opts.runId ?? null,
            });
            resultStr = `Filed issue "${issue.title}"${issue.externalUrl ? ` → ${issue.externalUrl}` : ' (local)'}.`;
          } catch (e) {
            resultStr = `Failed to file issue: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      } else if (tc.name === 'add_project_goal') {
        const title = String(tc.args.title ?? '').trim();
        if (!title) {
          resultStr = 'Error: title is required';
        } else {
          try {
            const goal = await goalRepo.create(projectId, {
              title,
              description: String(tc.args.description ?? ''),
              priority: (tc.args.priority as GoalPriority) ?? 'medium',
              source: 'agent',
            });
            resultStr = `Added project goal "${goal.title}".`;
          } catch (e) {
            resultStr = `Failed to add goal: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      } else if (tc.name === DELEGATE) {
        const ref = String(tc.args.agent ?? '');
        const spec = specialists.find((s) => s.slug === ref || s.id === ref || s.name === ref);
        if (!spec) {
          resultStr = `No such specialist: "${ref}". Available: ${specialists.map((s) => s.slug).join(', ')}`;
        } else {
          const task = String(tc.args.task ?? '');
          onEvent?.({ type: 'delegate', agent: spec.name, task });
          const sub = await runAgentTurn({ agent: spec, projectId, workspacePath, messages: [{ role: 'user', content: task }], depth: depth + 1, onEvent, requireApproval: opts.requireApproval });
          filesWritten.push(...sub.filesWritten);
          pendingWrites.push(...sub.pendingWrites);
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
          const exec = executeFileTool(workspacePath, tc.name, tc.args, { stageOnly: opts.requireApproval });
          resultStr = exec.result;
          if (exec.write) {
            const w: FileWrite = { ...exec.write, agentId: agent.id };
            if (opts.requireApproval) {
              pendingWrites.push(w);
              onEvent?.({ type: 'pendingWrite', path: w.path, operation: w.operation, agentId: w.agentId });
            } else {
              filesWritten.push(w);
              onEvent?.({ type: 'write', ...w });
            }
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
