import { ClaudeService, type ClaudeCallResult } from './claude.service.js';
import { createLogger } from '../utils/logger.js';
import type { Agent } from '@subagent/shared';

const log = createLogger('orchestrator');

export interface DecomposedTask {
  title: string;
  description: string;
  assignedAgentSlug: string;
  priority: number;
  dependencies: string[]; // titles of tasks this depends on
  order: number;
}

export interface DecompositionResult {
  tasks: DecomposedTask[];
  reasoning: string;
  apiResult: ClaudeCallResult;
}

const DECOMPOSITION_INSTRUCTION = `You are an orchestrator agent. Your job is to decompose a high-level project objective into concrete, actionable tasks that can be assigned to specialist agents.

You will be given:
1. The project objective
2. A list of available specialist agents with their roles and capabilities
3. Context about the project workspace

Respond ONLY with a valid JSON object in the following format (no markdown, no code fences):
{
  "reasoning": "Brief explanation of your decomposition strategy",
  "tasks": [
    {
      "title": "Short task title",
      "description": "Detailed description of what needs to be done",
      "assignedAgentSlug": "slug-of-the-agent",
      "priority": 1,
      "dependencies": ["Title of dependency task"],
      "order": 1
    }
  ]
}

Rules:
- Each task should be specific enough for a single agent to complete
- Use dependencies to express ordering constraints (reference by title)
- Priority 1 is highest, 5 is lowest
- Order determines execution sequence (lower = earlier)
- Ensure the plan is complete and covers the full objective
- Assign tasks only to agents that are listed as available`;

export async function decomposeObjective(
  claudeService: ClaudeService,
  orchestratorAgent: Agent,
  objective: string,
  availableAgents: Agent[],
  projectContext: string,
): Promise<DecompositionResult> {
  log.info('Decomposing objective into tasks...');

  const agentList = availableAgents
    .filter((a) => a.role === 'specialist')
    .map((a) => `- ${a.name} (slug: ${a.slug}): ${a.description}`)
    .join('\n');

  const userMessage = `## Objective
${objective}

## Available Specialist Agents
${agentList}

## Project Context
${projectContext}

Please decompose this objective into tasks and assign them to the appropriate agents.`;

  const systemPrompt = orchestratorAgent.systemPrompt
    ? `${orchestratorAgent.systemPrompt}\n\n${DECOMPOSITION_INSTRUCTION}`
    : DECOMPOSITION_INSTRUCTION;

  const apiResult = await claudeService.sendMessage({
    model: orchestratorAgent.modelConfig.model,
    maxTokens: orchestratorAgent.modelConfig.maxTokens,
    temperature: orchestratorAgent.modelConfig.temperature,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  try {
    // Try to extract JSON from the response
    let jsonText = apiResult.text.trim();

    // Handle if wrapped in code fences
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText) as { reasoning: string; tasks: DecomposedTask[] };

    log.info(`Decomposed into ${parsed.tasks.length} tasks`);

    return {
      tasks: parsed.tasks,
      reasoning: parsed.reasoning,
      apiResult,
    };
  } catch (parseError) {
    log.error('Failed to parse orchestrator response as JSON', parseError);
    log.error('Raw response:', apiResult.text);

    // Return a single fallback task
    return {
      tasks: [{
        title: 'Execute Objective',
        description: objective,
        assignedAgentSlug: availableAgents.find((a) => a.role === 'specialist')?.slug ?? 'unknown',
        priority: 1,
        dependencies: [],
        order: 1,
      }],
      reasoning: 'Failed to decompose - falling back to single task',
      apiResult,
    };
  }
}
