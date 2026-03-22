import { workspaceService } from '../services/workspace.service.js';
import { taskRepo } from '../db/repositories/task.repo.js';
import type { Agent, Task } from '@subagent/shared';
import type { AgentContext } from '../services/agent-runner.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('context-builder');

/**
 * Builds the execution context for an agent about to run a task.
 * Includes: system prompt context, dependent task outputs, relevant workspace files.
 */
export function buildAgentContext(
  agent: Agent,
  task: Task,
  workspacePath: string,
): AgentContext {
  // Gather outputs from dependency tasks
  const dependencyOutputs: AgentContext['dependencyOutputs'] = [];

  for (const depId of task.dependencies) {
    const depTask = taskRepo.findById(depId);
    if (depTask?.output) {
      dependencyOutputs.push({
        taskTitle: depTask.title,
        output: depTask.output,
      });
    }
  }

  // Try to read relevant workspace files (best effort)
  const relevantFiles: AgentContext['relevantFiles'] = [];
  try {
    // Read common project files for context
    const contextFiles = [
      'package.json',
      'README.md',
      'tsconfig.json',
      '.gitignore',
    ];

    for (const filePath of contextFiles) {
      try {
        const content = workspaceService.readFile(workspacePath, filePath);
        if (content.length < 10000) { // Only include reasonably sized files
          relevantFiles.push({ path: filePath, content });
        }
      } catch {
        // File doesn't exist, skip
      }
    }
  } catch (error) {
    log.warn('Failed to read workspace files for context', error);
  }

  return {
    workspacePath,
    taskDescription: task.description,
    dependencyOutputs,
    relevantFiles,
  };
}

/**
 * Builds a project-level context string for the orchestrator.
 */
export function buildProjectContext(workspacePath: string): string {
  const parts: string[] = [];

  try {
    const tree = workspaceService.getFileTree(workspacePath);
    parts.push('## Project File Structure');
    parts.push(formatTree(tree, 0));
  } catch {
    parts.push('(Could not read project file structure)');
  }

  // Try to read package.json for project info
  try {
    const pkg = workspaceService.readFile(workspacePath, 'package.json');
    parts.push('\n## package.json');
    parts.push(pkg);
  } catch {
    // no package.json
  }

  return parts.join('\n');
}

interface TreeNode {
  name: string;
  type: string;
  children?: TreeNode[];
}

function formatTree(node: TreeNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const prefix = node.type === 'directory' ? '/' : '';
  let result = `${indent}${node.name}${prefix}\n`;

  if (node.children && depth < 3) {
    for (const child of node.children) {
      result += formatTree(child, depth + 1);
    }
  }

  return result;
}
