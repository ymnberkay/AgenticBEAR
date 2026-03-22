import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useFileTree } from '../../api/hooks/use-workspace';
import { FileTree } from '../../components/workspace/file-tree';
import { FileViewer } from '../../components/workspace/file-viewer';

export function ProjectWorkspacePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: fileTree, isLoading } = useFileTree(projectId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  return (
    <div className="flex rounded border border-[#333333] overflow-hidden h-[calc(100vh-240px)] min-h-[360px]">
      {/* File tree */}
      <div className="w-[200px] shrink-0 border-r border-[#333333] bg-[#0e0e11] overflow-y-auto">
        <FileTree
          nodes={fileTree}
          isLoading={isLoading}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
      </div>

      {/* Viewer */}
      <div className="flex-1 bg-[#08080a] overflow-hidden">
        <FileViewer projectId={projectId} filePath={selectedPath} />
      </div>
    </div>
  );
}
