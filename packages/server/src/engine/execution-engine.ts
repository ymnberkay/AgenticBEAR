import { ClaudeService } from '../services/claude.service.js';
import { decomposeObjective } from '../services/orchestrator.service.js';
import { executeTask } from '../services/agent-runner.service.js';
import { tokenTracker } from '../services/token-tracker.service.js';
import { buildAgentContext, buildProjectContext } from './context-builder.js';
import { TaskQueue } from './task-queue.js';
import { projectRepo } from '../db/repositories/project.repo.js';
import { agentRepo } from '../db/repositories/agent.repo.js';
import { runRepo } from '../db/repositories/run.repo.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import { memoryRepo } from '../db/repositories/memory.repo.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';
import { workspaceService } from '../services/workspace.service.js';
import { eventBus } from '../utils/event-bus.js';
import { createLogger } from '../utils/logger.js';
import type { Run, Task, Agent } from '@subagent/shared';

const log = createLogger('engine');

// Track active runs for pause/cancel
const activeRuns = new Map<string, { paused: boolean; cancelled: boolean }>();

export const executionEngine = {
  async startRun(runId: string): Promise<void> {
    log.info(`Starting run: ${runId}`);

    // Get run details
    const run = runRepo.findById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const project = projectRepo.findById(run.projectId);
    if (!project) throw new Error(`Project not found: ${run.projectId}`);

    if (!project.orchestratorId) {
      throw new Error('Project has no orchestrator agent configured');
    }

    const orchestrator = agentRepo.findById(project.orchestratorId);
    if (!orchestrator) throw new Error('Orchestrator agent not found');

    const agents = agentRepo.findByProjectId(project.id);

    // Get API key
    const settings = settingsRepo.getSettings();
    if (!settings.apiKey) {
      throw new Error('No API key configured. Please set your Claude API key in Settings.');
    }

    const claudeService = new ClaudeService(settings.apiKey);

    // Initialize tracking
    tokenTracker.initRun(runId);
    activeRuns.set(runId, { paused: false, cancelled: false });

    // Update run status
    runRepo.update(runId, { status: 'running', startedAt: new Date().toISOString() });
    eventBus.emitAndCreate('run:started', runId, { projectId: project.id });

    try {
      // Step 1: Orchestrator decomposes the objective
      log.info('Decomposing objective...');
      const projectContext = buildProjectContext(project.workspacePath);

      const decomposition = await decomposeObjective(
        claudeService,
        orchestrator,
        run.objective,
        agents,
        projectContext,
      );

      // Track orchestrator token usage
      const orchStepId = `orch-${runId}`;
      tokenTracker.recordUsage(
        runId,
        orchStepId,
        orchestrator.modelConfig.model,
        decomposition.apiResult.inputTokens,
        decomposition.apiResult.outputTokens,
      );

      // Record the orchestrator's reasoning as a step
      taskRepo.createStep({
        runId,
        taskId: 'orchestrator',
        agentId: orchestrator.id,
        type: 'reasoning',
        input: run.objective,
        output: decomposition.reasoning,
        inputTokens: decomposition.apiResult.inputTokens,
        outputTokens: decomposition.apiResult.outputTokens,
        costUsd: tokenTracker.getRunTotals(runId).totalCostUsd,
        durationMs: 0,
      });

      // Step 2: Create tasks in DB
      const agentsBySlug = new Map(agents.map((a) => [a.slug, a]));
      const createdTasks: Task[] = [];
      const taskTitleToId = new Map<string, string>();

      for (const dt of decomposition.tasks) {
        const agent = agentsBySlug.get(dt.assignedAgentSlug);
        if (!agent) {
          log.warn(`Agent with slug "${dt.assignedAgentSlug}" not found, skipping task "${dt.title}"`);
          continue;
        }

        const task = taskRepo.createTask({
          runId,
          assignedAgentId: agent.id,
          title: dt.title,
          description: dt.description,
          priority: dt.priority,
          dependencies: [], // We'll resolve these after all tasks are created
          order: dt.order,
        });

        taskTitleToId.set(dt.title, task.id);
        createdTasks.push(task);

        eventBus.emitAndCreate('task:created', runId, {
          taskId: task.id,
          title: task.title,
          assignedAgentId: agent.id,
          agentName: agent.name,
        });
      }

      // Resolve dependency titles to IDs and update tasks
      for (let i = 0; i < decomposition.tasks.length; i++) {
        const dt = decomposition.tasks[i];
        const task = createdTasks[i];
        if (!task) continue;

        const depIds = dt.dependencies
          .map((title) => taskTitleToId.get(title))
          .filter((id): id is string => id !== undefined);

        if (depIds.length > 0) {
          // Update in DB via direct SQL since we need to set dependencies
          const { getDb } = await import('../db/client.js');
          getDb().prepare('UPDATE tasks SET dependencies = ? WHERE id = ?')
            .run(JSON.stringify(depIds), task.id);
          task.dependencies = depIds;
        }
      }

      // Step 3: Execute tasks respecting dependencies
      const queue = new TaskQueue();
      queue.addTasks(createdTasks);

      const maxConcurrent = settings.maxConcurrentAgents;

      while (!queue.isAllDone()) {
        const state = activeRuns.get(runId);
        if (!state) break;

        if (state.cancelled) {
          log.info(`Run ${runId} cancelled`);
          runRepo.update(runId, { status: 'cancelled', completedAt: new Date().toISOString() });
          eventBus.emitAndCreate('run:cancelled', runId, {});
          tokenTracker.cleanupRun(runId);
          activeRuns.delete(runId);
          return;
        }

        if (state.paused) {
          log.info(`Run ${runId} paused, waiting...`);
          runRepo.update(runId, { status: 'paused' });
          eventBus.emitAndCreate('run:paused', runId, {});
          // Wait and check again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const readyTasks = queue.getNextReady();
        if (readyTasks.length === 0) {
          // No tasks ready, wait for in-progress ones
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // Execute ready tasks (up to maxConcurrent)
        const batch = readyTasks.slice(0, maxConcurrent);
        const promises = batch.map((task) => this.executeOneTask(claudeService, runId, project.id, task, project.workspacePath, queue));

        await Promise.allSettled(promises);

        // Update run totals
        const totals = tokenTracker.getRunTotals(runId);
        runRepo.update(runId, {
          totalInputTokens: totals.totalInputTokens,
          totalOutputTokens: totals.totalOutputTokens,
          totalCostUsd: totals.totalCostUsd,
        });

        eventBus.emitAndCreate('tokens:updated', runId, totals);
      }

      // Step 4: Documentation step — if a documentation agent exists and all tasks succeeded
      if (!queue.hasFailures()) {
        const docAgent = agents.find((a) =>
          a.role === 'specialist' &&
          (a.name.toLowerCase().includes('doc') || a.slug.toLowerCase().includes('doc')),
        );

        if (docAgent) {
          await this.runDocumentationStep(
            claudeService, runId, run, project.workspacePath, createdTasks, docAgent,
          );
        }
      }

      // Step 5: Save summary memories per agent
      const completedForMemory = createdTasks.filter((t) => t.status === 'completed' && t.output);
      const byAgent = new Map<string, Task[]>();
      for (const t of completedForMemory) {
        byAgent.set(t.assignedAgentId, [...(byAgent.get(t.assignedAgentId) ?? []), t]);
      }
      for (const [agentId, agentTasks] of byAgent) {
        const summaryText = agentTasks
          .map((t) => `- ${t.title}: ${(t.output ?? '').slice(0, 200)}`)
          .join('\n');
        memoryRepo.create({
          agentId,
          projectId: project.id,
          type: 'summary',
          query: run.objective,
          response: `Run ${runId}:\n${summaryText}`,
          runId,
        });
      }

      // Step 6: Complete the run
      const finalTotals = tokenTracker.getRunTotals(runId);
      const finalStatus = queue.hasFailures() ? 'failed' : 'completed';

      runRepo.update(runId, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        totalInputTokens: finalTotals.totalInputTokens,
        totalOutputTokens: finalTotals.totalOutputTokens,
        totalCostUsd: finalTotals.totalCostUsd,
      });

      eventBus.emitAndCreate(finalStatus === 'completed' ? 'run:completed' : 'run:failed', runId, {
        ...finalTotals,
        stats: queue.getStats(),
      });

      log.info(`Run ${runId} ${finalStatus}. Tokens: ${finalTotals.totalInputTokens} in / ${finalTotals.totalOutputTokens} out / $${finalTotals.totalCostUsd.toFixed(4)}`);

    } catch (error) {
      log.error(`Run ${runId} failed with error`, error);

      const totals = tokenTracker.getRunTotals(runId);
      runRepo.update(runId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        totalInputTokens: totals.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens,
        totalCostUsd: totals.totalCostUsd,
      });

      eventBus.emitAndCreate('run:failed', runId, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      tokenTracker.cleanupRun(runId);
      activeRuns.delete(runId);
    }
  },

  async executeOneTask(
    claudeService: ClaudeService,
    runId: string,
    projectId: string,
    task: Task,
    workspacePath: string,
    queue: TaskQueue,
  ): Promise<void> {
    const agent = agentRepo.findById(task.assignedAgentId);
    if (!agent) {
      log.error(`Agent not found for task: ${task.assignedAgentId}`);
      queue.markFailed(task.id);
      taskRepo.updateTask(task.id, { status: 'failed' });
      return;
    }

    queue.markInProgress(task.id);
    taskRepo.updateTask(task.id, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });

    eventBus.emitAndCreate('task:started', runId, {
      taskId: task.id,
      title: task.title,
      agentId: agent.id,
      agentName: agent.name,
    });

    try {
      const startTime = Date.now();
      const context = buildAgentContext(agent, task, workspacePath);
      const result = await executeTask(claudeService, agent, task, context, projectId);
      const durationMs = Date.now() - startTime;

      // Record token usage
      const stepId = `${task.id}-exec`;
      const usage = tokenTracker.recordUsage(
        runId,
        stepId,
        agent.modelConfig.model,
        result.apiResult.inputTokens,
        result.apiResult.outputTokens,
      );

      // Create run step
      taskRepo.createStep({
        runId,
        taskId: task.id,
        agentId: agent.id,
        type: 'api_call',
        input: task.description,
        output: result.output,
        inputTokens: result.apiResult.inputTokens,
        outputTokens: result.apiResult.outputTokens,
        costUsd: usage.costUsd,
        durationMs,
      });

      // Mark task complete
      queue.markComplete(task.id);
      taskRepo.updateTask(task.id, {
        status: 'completed',
        output: result.output,
        completedAt: new Date().toISOString(),
      });

      eventBus.emitAndCreate('task:completed', runId, {
        taskId: task.id,
        title: task.title,
        agentId: agent.id,
        agentName: agent.name,
        inputTokens: result.apiResult.inputTokens,
        outputTokens: result.apiResult.outputTokens,
      });

    } catch (error) {
      log.error(`Task "${task.title}" execution failed`, error);

      queue.markFailed(task.id);
      taskRepo.updateTask(task.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });

      // Record error step
      taskRepo.createStep({
        runId,
        taskId: task.id,
        agentId: agent.id,
        type: 'error',
        input: task.description,
        output: error instanceof Error ? error.message : String(error),
      });

      eventBus.emitAndCreate('task:failed', runId, {
        taskId: task.id,
        title: task.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async runDocumentationStep(
    claudeService: ClaudeService,
    runId: string,
    run: Run,
    workspacePath: string,
    tasks: Task[],
    docAgent: Agent,
  ): Promise<void> {
    log.info(`Running documentation step for run ${runId}`);

    eventBus.emitAndCreate('task:created', runId, {
      taskId: 'doc-step',
      title: 'Documentation',
      assignedAgentId: docAgent.id,
      agentName: docAgent.name,
    });
    eventBus.emitAndCreate('task:started', runId, {
      taskId: 'doc-step',
      title: 'Documentation',
      agentId: docAgent.id,
      agentName: docAgent.name,
    });

    try {
      const completedTasks = tasks.filter((t) => t.status === 'completed' && t.output);
      const taskSummaries = completedTasks
        .map((t) => `## ${t.title}\n${t.output}`)
        .join('\n\n---\n\n');

      const prompt = `You are documenting the results of the following completed tasks.

## Original Objective
${run.objective}

## Completed Tasks
${taskSummaries}

Please produce a structured documentation file that summarizes:
1. What was accomplished
2. Key decisions and outputs from each task
3. Any important notes or recommendations

Format it clearly so it can be saved as a .txt file.`;

      const startTime = Date.now();
      const result = await claudeService.sendMessage({
        model: docAgent.modelConfig.model,
        maxTokens: docAgent.modelConfig.maxTokens ?? 4096,
        systemPrompt: docAgent.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      const durationMs = Date.now() - startTime;

      // Write to .txt file in workspace
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `reports/run-${timestamp}.txt`;
      const fileContent = `AgenticBEAR Run Report\n${'='.repeat(60)}\nObjective: ${run.objective}\nDate: ${new Date().toISOString()}\nRun ID: ${runId}\n\n${'='.repeat(60)}\n\n${result.text}`;

      try {
        workspaceService.writeFile(workspacePath, fileName, fileContent);
        log.info(`Documentation written to ${workspacePath}/${fileName}`);
      } catch (writeError) {
        log.warn('Could not write documentation file (no workspace?)', writeError);
      }

      // Track token usage
      const stepId = `doc-${runId}`;
      tokenTracker.recordUsage(runId, stepId, docAgent.modelConfig.model, result.inputTokens, result.outputTokens);

      // Record step
      taskRepo.createStep({
        runId,
        taskId: 'doc-step',
        agentId: docAgent.id,
        type: 'api_call',
        input: prompt,
        output: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: tokenTracker.getRunTotals(runId).totalCostUsd,
        durationMs,
      });

      eventBus.emitAndCreate('task:completed', runId, {
        taskId: 'doc-step',
        title: 'Documentation',
        agentId: docAgent.id,
        agentName: docAgent.name,
        outputFile: fileName,
      });

      log.info(`Documentation step completed for run ${runId}`);
    } catch (err) {
      log.error('Documentation step failed', err);
      // Non-fatal — don't fail the whole run
    }
  },

  pauseRun(runId: string): boolean {
    const state = activeRuns.get(runId);
    if (!state) return false;
    state.paused = true;
    log.info(`Pause requested for run ${runId}`);
    return true;
  },

  resumeRun(runId: string): boolean {
    const state = activeRuns.get(runId);
    if (!state) return false;
    state.paused = false;
    runRepo.update(runId, { status: 'running' });
    eventBus.emitAndCreate('run:started', runId, { resumed: true });
    log.info(`Resume requested for run ${runId}`);
    return true;
  },

  cancelRun(runId: string): boolean {
    const state = activeRuns.get(runId);
    if (!state) {
      // Run might not be active, update DB directly
      const run = runRepo.findById(runId);
      if (run && (run.status === 'pending' || run.status === 'paused')) {
        runRepo.update(runId, { status: 'cancelled', completedAt: new Date().toISOString() });
        eventBus.emitAndCreate('run:cancelled', runId, {});
        return true;
      }
      return false;
    }
    state.cancelled = true;
    log.info(`Cancel requested for run ${runId}`);
    return true;
  },

  isRunActive(runId: string): boolean {
    return activeRuns.has(runId);
  },
};
