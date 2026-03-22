import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'bin',
  'obj',
]);

const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
]);

export function buildFileTree(rootPath: string, relativePath: string = '', maxDepth: number = 5): TreeNode {
  const fullPath = relativePath ? join(rootPath, relativePath) : rootPath;
  const name = basename(fullPath);

  const node: TreeNode = {
    name,
    path: relativePath || '.',
    type: 'directory',
    children: [],
  };

  if (maxDepth <= 0) return node;

  try {
    const entries = readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && IGNORED_DIRS.has(entry.name)) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (IGNORED_FILES.has(entry.name)) continue;

      const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        const child = buildFileTree(rootPath, entryRelativePath, maxDepth - 1);
        node.children!.push(child);
      } else if (entry.isFile()) {
        node.children!.push({
          name: entry.name,
          path: entryRelativePath,
          type: 'file',
        });
      }
    }

    // Sort: directories first, then alphabetically
    node.children!.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    // Permission denied or other errors -- return empty children
  }

  return node;
}
