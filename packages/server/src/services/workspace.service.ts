import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { buildFileTree, type TreeNode } from '../utils/file-tree.js';

/**
 * Ensures the resolved path is within the workspace root.
 * Throws if path traversal is attempted.
 */
function assertWithinWorkspace(workspacePath: string, relativePath: string): string {
  const absWorkspace = resolve(workspacePath);
  const absTarget = resolve(absWorkspace, relativePath);

  // Check that resolved path starts with workspace
  if (!absTarget.startsWith(absWorkspace)) {
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
};
