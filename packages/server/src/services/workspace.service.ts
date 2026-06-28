import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { buildFileTree, type TreeNode } from '../utils/file-tree.js';

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
};
