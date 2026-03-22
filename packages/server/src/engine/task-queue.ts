import type { Task } from '@subagent/shared';
import { createLogger } from '../utils/logger.js';

const log = createLogger('task-queue');

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private inProgress: Set<string> = new Set();

  addTasks(tasks: Task[]): void {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
    log.info(`Added ${tasks.length} tasks to queue. Total: ${this.tasks.size}`);
  }

  /**
   * Returns the next task(s) that are ready to execute.
   * A task is ready when all its dependencies are completed.
   */
  getNextReady(): Task[] {
    const ready: Task[] = [];

    for (const [id, task] of this.tasks) {
      if (this.completed.has(id) || this.failed.has(id) || this.inProgress.has(id)) {
        continue;
      }

      if (task.status !== 'queued') {
        continue;
      }

      // Check if all dependencies are completed
      const depsReady = task.dependencies.every((depId) => this.completed.has(depId));
      if (depsReady) {
        ready.push(task);
      }
    }

    // Sort by priority (lower = higher priority) then by order
    ready.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.order - b.order;
    });

    return ready;
  }

  markInProgress(taskId: string): void {
    this.inProgress.add(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'in_progress' as Task['status'];
    }
  }

  markComplete(taskId: string): void {
    this.inProgress.delete(taskId);
    this.completed.add(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed' as Task['status'];
    }
    log.info(`Task ${taskId} completed. Progress: ${this.completed.size}/${this.tasks.size}`);
  }

  markFailed(taskId: string): void {
    this.inProgress.delete(taskId);
    this.failed.add(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed' as Task['status'];
    }
    log.warn(`Task ${taskId} failed`);
  }

  isAllDone(): boolean {
    return this.completed.size + this.failed.size === this.tasks.size;
  }

  hasFailures(): boolean {
    return this.failed.size > 0;
  }

  getStats(): { total: number; completed: number; failed: number; inProgress: number; queued: number } {
    return {
      total: this.tasks.size,
      completed: this.completed.size,
      failed: this.failed.size,
      inProgress: this.inProgress.size,
      queued: this.tasks.size - this.completed.size - this.failed.size - this.inProgress.size,
    };
  }
}
