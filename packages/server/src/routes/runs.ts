import type { FastifyInstance } from 'fastify';
import { runRepo } from '../db/repositories/run.repo.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import { executionEngine } from '../engine/execution-engine.js';
import type { CreateRunInput } from '@subagent/shared';

export async function runRoutes(app: FastifyInstance): Promise<void> {
  // List runs by project
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/runs', async (request, reply) => {
    const runs = runRepo.findByProjectId(request.params.projectId);
    return reply.send(runs);
  });

  // Create a new run
  app.post<{ Params: { projectId: string }; Body: { objective: string } }>(
    '/api/projects/:projectId/runs',
    async (request, reply) => {
      const { projectId } = request.params;
      const { objective } = request.body;

      if (!objective) {
        return reply.status(400).send({ error: true, message: 'objective is required' });
      }

      const run = runRepo.create({ projectId, objective });
      return reply.status(201).send(run);
    },
  );

  // Get run by ID
  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const run = runRepo.findById(request.params.id);
    if (!run) {
      return reply.status(404).send({ error: true, message: 'Run not found' });
    }
    return reply.send(run);
  });

  // Update run
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/runs/:id', async (request, reply) => {
    const run = runRepo.update(request.params.id, request.body as any);
    if (!run) {
      return reply.status(404).send({ error: true, message: 'Run not found' });
    }
    return reply.send(run);
  });

  // Start run execution
  app.post<{ Params: { id: string } }>('/api/runs/:id/start', async (request, reply) => {
    const run = runRepo.findById(request.params.id);
    if (!run) {
      return reply.status(404).send({ error: true, message: 'Run not found' });
    }

    if (run.status !== 'pending' && run.status !== 'paused') {
      return reply.status(400).send({ error: true, message: `Cannot start run with status "${run.status}"` });
    }

    if (run.status === 'paused') {
      executionEngine.resumeRun(run.id);
      return reply.send({ message: 'Run resumed', runId: run.id });
    }

    // Fire and forget -- the engine runs asynchronously
    executionEngine.startRun(run.id).catch((err) => {
      console.error('Run execution error:', err);
    });

    return reply.send({ message: 'Run started', runId: run.id });
  });

  // Pause run
  app.post<{ Params: { id: string } }>('/api/runs/:id/pause', async (request, reply) => {
    const success = executionEngine.pauseRun(request.params.id);
    if (!success) {
      return reply.status(400).send({ error: true, message: 'Run is not active' });
    }
    return reply.send({ message: 'Run paused' });
  });

  // Cancel run
  app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (request, reply) => {
    const success = executionEngine.cancelRun(request.params.id);
    if (!success) {
      return reply.status(400).send({ error: true, message: 'Run is not active or cannot be cancelled' });
    }
    return reply.send({ message: 'Run cancelled' });
  });

  // Get tasks for a run
  app.get<{ Params: { id: string } }>('/api/runs/:id/tasks', async (request, reply) => {
    const tasks = taskRepo.findByRunId(request.params.id);
    return reply.send(tasks);
  });

  // Get steps for a run
  app.get<{ Params: { id: string } }>('/api/runs/:id/steps', async (request, reply) => {
    const steps = taskRepo.findStepsByRunId(request.params.id);
    return reply.send(steps);
  });

  // Get file changes for a run
  app.get<{ Params: { id: string } }>('/api/runs/:id/file-changes', async (request, reply) => {
    const changes = taskRepo.findFileChangesByRunId(request.params.id);
    return reply.send(changes);
  });
}
