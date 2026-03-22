import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface FileTreeProps {
  nodes: FileTreeNode[] | undefined;
  isLoading: boolean;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  changedFiles?: Set<string>;
}

export function FileTree({ nodes, isLoading, selectedPath, onSelectFile, changedFiles }: FileTreeProps) {
  if (isLoading) {
    return (
      <div className="p-2.5 text-[12px] text-text-disabled">Loading file tree...</div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="p-2.5 text-[12px] text-text-disabled">No files found in workspace.</div>
    );
  }

  return (
    <div className="py-0.5">
      {nodes.map((node) => (
        <FileTreeNodeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          changedFiles={changedFiles}
        />
      ))}
    </div>
  );
}

function FileTreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelectFile,
  changedFiles,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  changedFiles?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === 'directory';
  const isSelected = selectedPath === node.path;
  const isChanged = changedFiles?.has(node.path);

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-1.5 py-0.5 pr-2 text-[12px] transition-colors duration-150 hover:bg-bg-raised',
          isSelected && 'bg-[#00d4ff]/10 text-[#00d4ff]',
          !isSelected && 'text-text-secondary',
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-text-disabled shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-disabled shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {isDir ? (
          expanded ? (
            <FolderOpen className="h-3.5 w-3.5 text-[#00d4ff]/70 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-text-disabled shrink-0" />
          )
        ) : (
          <File className="h-3.5 w-3.5 text-text-disabled shrink-0" />
        )}

        <span className="truncate text-[12px]">{node.name}</span>

        {isChanged && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#00d4ff] shrink-0" />
        )}
      </button>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              changedFiles={changedFiles}
            />
          ))}
        </div>
      )}
    </div>
  );
}
