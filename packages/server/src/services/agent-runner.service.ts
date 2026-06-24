import { ClaudeService, type ClaudeCallResult } from './claude.service.js';
import { createLogger } from '../utils/logger.js';
import { buildTaskContextMessage } from '../utils/prompt-adapter.js';
import { buildMemoryBlock } from '../engine/context-builder.js';
import { memoryRepo } from '../db/repositories/memory.repo.js';
import { runAgentTurn, type RunTurnResult } from './agent-loop.service.js';
import type { Agent, Task } from '@subagent/shared';

const log = createLogger('agent-runner');

export interface AgentContext {
  workspacePath: string;
  taskDescription: string;
  dependencyOutputs: Array<{ taskTitle: string; output: string }>;
  relevantFiles: Array<{ path: string; content: string }>;
}

export interface AgentExecutionResult {
  output: string;
  apiResult: ClaudeCallResult;
  /** Files the agent actually wrote to the workspace via tool-use (for file_changes recording). */
  filesWritten: RunTurnResult['filesWritten'];
}

/**
 * Run a task's assigned agent through the agentic tool-use loop so it can ACTUALLY write
 * files into the project workspace (sandboxed), not just describe them. The loop bypasses
 * the cost-layer cache/router (side effects) but is cost-recorded; we synthesize a
 * ClaudeCallResult so the engine's existing run_step/token recording works unchanged.
 */
export async function executeTask(
  _claudeService: ClaudeService,
  agent: Agent,
  task: Task,
  context: AgentContext,
  projectId: string,
): Promise<AgentExecutionResult> {
  log.info(`Executing task "${task.title}" with agent "${agent.name}"`);

  const contextMessage = buildTaskContextMessage({
    model: agent.modelConfig.model,
    taskTitle: task.title,
    taskDescription: context.taskDescription,
    dependencyOutputs: context.dependencyOutputs,
    relevantFiles: context.relevantFiles,
    workspacePath: context.workspacePath,
  });

  // Preserve agent memory by folding it into the system prompt; the loop adds project
  // knowledge + tool guidance on top of whatever systemPrompt the agent carries.
  const memoryBlock = await buildMemoryBlock(agent.id);
  const basePrompt = memoryBlock ? `${agent.systemPrompt}\n\n${memoryBlock}` : agent.systemPrompt;

  const turn = await runAgentTurn({
    agent: { ...agent, systemPrompt: basePrompt },
    projectId,
    workspacePath: context.workspacePath,
    messages: [{ role: 'user', content: contextMessage }],
  });

  // L2 level-routing may have served a cheaper model; record both actual + baseline for savings.
  const apiResult: ClaudeCallResult = {
    text: turn.text,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    stopReason: 'end_turn',
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheHit: turn.cacheHit,
    servedModel: turn.servedModel as ClaudeCallResult['servedModel'],
    routerTier: turn.routerTier,
    actualCostUsd: turn.costUsd,
    baselineCostUsd: turn.baselineCostUsd,
    compressionSavedTokens: turn.compressionSavedTokens,
  };

  log.info(
    `Task "${task.title}" completed. Tokens: ${turn.inputTokens} in / ${turn.outputTokens} out; ` +
      `${turn.filesWritten.length} file(s) written`,
  );

  await memoryRepo.create({
    agentId: agent.id,
    projectId,
    type: 'interaction',
    query: task.title,
    response: turn.text,
    runId: task.runId,
  });

  return { output: turn.text, apiResult, filesWritten: turn.filesWritten };
}
