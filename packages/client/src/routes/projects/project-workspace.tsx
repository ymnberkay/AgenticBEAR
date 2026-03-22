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
    <div className="flex border border-border-default overflow-hidden h-[calc(100vh-240px)] min-h-[360px]">
      {/* File tree */}
      <div className="w-[200px] shrink-0 border-r border-border-default bg-bg-nav overflow-y-auto">
        <FileTree
          nodes={fileTree}
          isLoading={isLoading}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
      </div>

      {/* Viewer */}
      <div className="flex-1 bg-bg-inset overflow-hidden">
        <FileViewer projectId={projectId} filePath={selectedPath} />
      </div>
    </div>
  );
}
