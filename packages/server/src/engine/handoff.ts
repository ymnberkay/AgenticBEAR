import { generateId } from '@subagent/shared';
import { taskRepo } from '../db/repositories/task.repo.js';
import { eventBus } from '../utils/event-bus.js';
import { createLogger } from '../utils/logger.js';
import type { Agent, Task } from '@subagent/shared';

const log = createLogger('handoff');

export interface HandoffRequest {
  fromAgent: Agent;
  toAgent: Agent;
  task: Task;
  reason: string;
  context: string;
}

/**
 * Handles agent-to-agent handoff.
 * Creates a handoff RunStep recording the transfer and
 * passes relevant context from the source agent to the target agent.
 */
export function performHandoff(request: HandoffRequest): void {
  const { fromAgent, toAgent, task, reason, context } = request;

  log.info(`Handoff: "${fromAgent.name}" -> "${toAgent.name}" for task "${task.title}". Reason: ${reason}`);

  // Record the handoff as a run step
  const step = taskRepo.createStep({
    runId: task.runId,
    taskId: task.id,
    agentId: fromAgent.id,
    type: 'handoff',
    input: JSON.stringify({
      fromAgent: fromAgent.slug,
      toAgent: toAgent.slug,
      reason,
    }),
    output: context,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: 0,
  });

  // Emit SSE event
  eventBus.emitAndCreate('step:completed', task.runId, {
    stepId: step.id,
    taskId: task.id,
    type: 'handoff',
    fromAgent: fromAgent.slug,
    toAgent: toAgent.slug,
    reason,
  });
}

/**
 * Creates a new follow-up task assigned to a different agent,
 * typically when the orchestrator decides mid-run that additional work is needed.
 */
export function createHandoffTask(
  runId: string,
  fromTask: Task,
  targetAgent: Agent,
  title: string,
  description: string,
): Task {
  log.info(`Creating handoff task "${title}" for agent "${targetAgent.name}"`);

  const newTask = taskRepo.createTask({
    runId,
    parentTaskId: fromTask.id,
    assignedAgentId: targetAgent.id,
    title,
    description,
    priority: fromTask.priority,
    dependencies: [fromTask.id],
    order: fromTask.order + 1,
  });

  // Emit SSE event
  eventBus.emitAndCreate('task:created', runId, {
    taskId: newTask.id,
    title: newTask.title,
    assignedAgentId: targetAgent.id,
    agentName: targetAgent.name,
  });

  return newTask;
}
