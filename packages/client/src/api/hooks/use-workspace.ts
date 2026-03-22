import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../client';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

const workspaceKeys = {
  fileTree: (projectId: string) => ['workspace', 'tree', projectId] as const,
  fileContent: (projectId: string, path: string) =>
    ['workspace', 'file', projectId, path] as const,
};

export function useFileTree(projectId: string) {
  return useQuery({
    queryKey: workspaceKeys.fileTree(projectId),
    queryFn: () => apiGet<FileTreeNode[]>(`/api/projects/${projectId}/workspace/tree`),
    enabled: !!projectId,
  });
}

export function useFileContent(projectId: string, path: string) {
  return useQuery({
    queryKey: workspaceKeys.fileContent(projectId, path),
    queryFn: () =>
      apiGet<{ content: string; path: string }>(
        `/api/projects/${projectId}/workspace/file?path=${encodeURIComponent(path)}`
      ),
    enabled: !!projectId && !!path,
  });
}
