import { ClaudeService, type ClaudeCallResult, type ClaudeMessage } from './claude.service.js';
import { createLogger } from '../utils/logger.js';
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
): Promise<AgentExecutionResult> {
  log.info(`Executing task "${task.title}" with agent "${agent.name}"`);

  const messages: ClaudeMessage[] = [];

  // Build context message
  let contextMessage = `## Task\n**${task.title}**\n\n${context.taskDescription}\n`;

  // Add dependency outputs
  if (context.dependencyOutputs.length > 0) {
    contextMessage += '\n## Outputs from Previous Tasks\n';
    for (const dep of context.dependencyOutputs) {
      contextMessage += `\n### ${dep.taskTitle}\n${dep.output}\n`;
    }
  }

  // Add relevant file contents
  if (context.relevantFiles.length > 0) {
    contextMessage += '\n## Relevant Files\n';
    for (const file of context.relevantFiles) {
      contextMessage += `\n### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n`;
    }
  }

  contextMessage += `\n## Workspace Path\n${context.workspacePath}\n`;
  contextMessage += '\n## Instructions\nComplete the task described above. Provide your output as a clear, structured response. If the task involves writing code, provide the complete code. If the task involves analysis, provide detailed findings.';

  messages.push({ role: 'user', content: contextMessage });

  const apiResult = await claudeService.sendMessage({
    model: agent.modelConfig.model,
    maxTokens: agent.modelConfig.maxTokens,
    temperature: agent.modelConfig.temperature,
    systemPrompt: agent.systemPrompt,
    messages,
    stopSequences: agent.modelConfig.stopSequences,
  });

  log.info(`Task "${task.title}" completed. Tokens: ${apiResult.inputTokens} in / ${apiResult.outputTokens} out`);

  return {
    output: apiResult.text,
    apiResult,
  };
}
