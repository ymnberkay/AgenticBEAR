import { ClaudeService, type ClaudeCallResult, type ClaudeMessage } from './claude.service.js';
import { createLogger } from '../utils/logger.js';
import { buildTaskContextMessage } from '../utils/prompt-adapter.js';
import { buildMemoryBlock } from '../engine/context-builder.js';
import { memoryRepo } from '../db/repositories/memory.repo.js';
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
}

export async function executeTask(
  claudeService: ClaudeService,
  agent: Agent,
  task: Task,
  context: AgentContext,
  projectId: string,
): Promise<AgentExecutionResult> {
  log.info(`Executing task "${task.title}" with agent "${agent.name}"`);

  const messages: ClaudeMessage[] = [];

  const contextMessage = buildTaskContextMessage({
    model: agent.modelConfig.model,
    taskTitle: task.title,
    taskDescription: context.taskDescription,
    dependencyOutputs: context.dependencyOutputs,
    relevantFiles: context.relevantFiles,
    workspacePath: context.workspacePath,
  });

  messages.push({ role: 'user', content: contextMessage });

  const memoryBlock = buildMemoryBlock(agent.id);
  const systemPromptWithMemory = memoryBlock
    ? `${agent.systemPrompt}\n\n${memoryBlock}`
    : agent.systemPrompt;

  const apiResult = await claudeService.sendMessage({
    model: agent.modelConfig.model,
    maxTokens: agent.modelConfig.maxTokens,
    temperature: agent.modelConfig.temperature,
    systemPrompt: systemPromptWithMemory,
    messages,
    stopSequences: agent.modelConfig.stopSequences,
  });

  log.info(`Task "${task.title}" completed. Tokens: ${apiResult.inputTokens} in / ${apiResult.outputTokens} out`);

  memoryRepo.create({
    agentId: agent.id,
    projectId,
    type: 'interaction',
    query: task.title,
    response: apiResult.text,
    runId: task.runId,
  });

  return {
    output: apiResult.text,
    apiResult,
  };
}
