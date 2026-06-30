import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, sep } from 'node:path';
import { buildFileTree, type TreeNode } from '../utils/file-tree.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  /** Process exit code; null if it was killed (e.g. timeout). */
  code: number | null;
  timedOut: boolean;
}

/**
 * Ensures the resolved path is within the workspace root.
 * Throws if path traversal is attempted (boundary-safe: '/ws-evil' is NOT inside '/ws').
 */
function assertWithinWorkspace(workspacePath: string, relativePath: string): string {
  const absWorkspace = resolve(workspacePath);
  const absTarget = resolve(absWorkspace, relativePath);

  if (absTarget !== absWorkspace && !absTarget.startsWith(absWorkspace + sep)) {
    throw new Error(`Path traversal detected: "${relativePath}" resolves outside workspace`);
  }

  return absTarget;
}

export const workspaceService = {
  getFileTree(workspacePath: string): TreeNode {
    return buildFileTree(resolve(workspacePath));
  },

  readFile(workspacePath: string, relativePath: string): string {
    const absPath = assertWithinWorkspace(workspacePath, relativePath);
    return readFileSync(absPath, 'utf-8');
  },

  writeFile(workspacePath: string, relativePath: string, content: string): void {
    const absPath = assertWithinWorkspace(workspacePath, relativePath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, 'utf-8');
  },

  deleteFile(workspacePath: string, relativePath: string): void {
    const absPath = assertWithinWorkspace(workspacePath, relativePath);
    if (existsSync(absPath)) rmSync(absPath, { recursive: false });
  },

  /**
   * Run a shell command with the workspace as the working directory (for builds, tests, logs).
   * Uses a login shell so PATH/nvm are available; bounded by a timeout + output cap. This is
   * arbitrary command execution scoped to the project's workspace dir.
   */
  runCommand(workspacePath: string, command: string, timeoutMs = 120_000): CommandResult {
    const cwd = resolve(workspacePath);
    const shell = process.env.SHELL || '/bin/bash';
    const res = spawnSync(shell, ['-lc', command], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf-8',
    });
    const timedOut = (res.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT' || res.signal === 'SIGTERM';
    return {
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? (res.error ? String(res.error.message) : ''),
      code: res.status,
      timedOut,
    };
  },
};
