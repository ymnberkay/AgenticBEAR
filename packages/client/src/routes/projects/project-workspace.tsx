import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useFileTree } from '../../api/hooks/use-workspace';
import { FileTree } from '../../components/workspace/file-tree';
import { FileViewer } from '../../components/workspace/file-viewer';

const STORAGE_KEY = 'workspace:tree-width';
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;

export function ProjectWorkspacePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: fileTree, isLoading } = useFileTree(projectId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(treeWidth));
    } catch {
      // ignore storage errors
    }
  }, [treeWidth]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setTreeWidth(next);
    };
    const stop = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onKeySplitter = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setTreeWidth((w) => Math.max(MIN_WIDTH, w - 8));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setTreeWidth((w) => Math.min(MAX_WIDTH, w + 8));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTreeWidth(MIN_WIDTH);
    } else if (e.key === 'End') {
      e.preventDefault();
      setTreeWidth(MAX_WIDTH);
    }
  };

  return (
    <div className="flex border border-border-default overflow-hidden h-[calc(100vh-160px)] min-h-[360px]">
      {/* File tree */}
      <div className="shrink-0 border-r border-border-default bg-bg-nav overflow-y-auto" style={{ width: treeWidth }}>
        <FileTree
          nodes={fileTree?.children}
          isLoading={isLoading}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
      </div>

      {/* Splitter */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={treeWidth}
        tabIndex={0}
        onMouseDown={startDrag}
        onKeyDown={onKeySplitter}
        className="focus-visible:outline-none focus-visible:bg-[rgba(124,140,248,0.25)]"
        style={{
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          background: 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.18)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* Viewer */}
      <div className="flex-1 bg-bg-inset overflow-hidden">
        <FileViewer projectId={projectId} filePath={selectedPath} />
      </div>
    </div>
  );
}
