import { useEffect, useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/skeleton';

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

interface FlatNode {
  node: FileTreeNode;
  depth: number;
  expanded: boolean;
  isLast: boolean;
  parentPath: string | null;
}

function flatten(
  nodes: FileTreeNode[],
  expanded: Set<string>,
  depth = 0,
  parentPath: string | null = null,
): FlatNode[] {
  const out: FlatNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isExpanded = node.type === 'directory' && expanded.has(node.path);
    const isLast = i === nodes.length - 1;
    out.push({ node, depth, expanded: isExpanded, isLast, parentPath });
    if (isExpanded && node.children) {
      out.push(...flatten(node.children, expanded, depth + 1, node.path));
    }
  }
  return out;
}

const STORAGE_PREFIX = 'file-tree-expanded:';

function readExpanded(rootKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + rootKey);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeExpanded(rootKey: string, set: Set<string>) {
  try { window.localStorage.setItem(STORAGE_PREFIX + rootKey, JSON.stringify([...set])); } catch { /* ignore */ }
}

// Top-level helper: derive a stable key for the localStorage bucket.
function deriveRootKey(nodes: FileTreeNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return 'empty';
  return nodes.map((n) => n.path).join('|');
}

export function FileTree({ nodes, isLoading, selectedPath, onSelectFile, changedFiles }: FileTreeProps) {
  const rootKey = deriveRootKey(nodes);
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(rootKey));
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-read storage when the rootKey changes (e.g., switching projects).
  useEffect(() => {
    setExpanded(readExpanded(rootKey));
  }, [rootKey]);

  useEffect(() => {
    writeExpanded(rootKey, expanded);
  }, [rootKey, expanded]);

  const flat = nodes ? flatten(nodes, expanded) : [];
  const focusedIdx = focusedPath ? flat.findIndex((f) => f.node.path === focusedPath) : -1;

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const focusAt = useCallback((idx: number) => {
    const safe = Math.max(0, Math.min(flat.length - 1, idx));
    const target = flat[safe]?.node.path;
    if (!target) return;
    setFocusedPath(target);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-file-path="${cssEscape(target)}"]`)
        ?.focus();
    });
  }, [flat]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(Math.max(0, focusedIdx) + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(Math.max(0, focusedIdx - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(flat.length - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const current = flat[focusedIdx];
      if (!current) return;
      if (current.node.type === 'directory') {
        if (!current.expanded) toggleExpand(current.node.path);
        else focusAt(focusedIdx + 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const current = flat[focusedIdx];
      if (!current) return;
      if (current.node.type === 'directory' && current.expanded) {
        toggleExpand(current.node.path);
      } else if (current.parentPath) {
        const parentIdx = flat.findIndex((f) => f.node.path === current.parentPath);
        if (parentIdx >= 0) focusAt(parentIdx);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const current = flat[focusedIdx];
      if (!current) return;
      if (current.node.type === 'directory') toggleExpand(current.node.path);
      else onSelectFile(current.node.path);
    }
  };

  if (isLoading) {
    return (
      <div className="p-2.5 flex flex-col gap-1.5" role="status" aria-live="polite" aria-label="Loading file tree">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={14} className={i % 3 === 0 ? 'w-2/3' : 'w-full'} />
        ))}
      </div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="p-3" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        No files in workspace.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label="Project files"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7c8cf8]"
    >
      {flat.map(({ node, depth, expanded: isExpanded }) => (
        <FileTreeNodeButton
          key={node.path}
          node={node}
          depth={depth}
          expanded={isExpanded}
          selected={selectedPath === node.path}
          focused={focusedPath === node.path}
          changed={changedFiles?.has(node.path)}
          onToggle={() => toggleExpand(node.path)}
          onSelect={() => {
            if (node.type === 'file') onSelectFile(node.path);
            else toggleExpand(node.path);
          }}
          onFocus={() => setFocusedPath(node.path)}
        />
      ))}
    </div>
  );
}

function FileTreeNodeButton({
  node,
  depth,
  expanded,
  selected,
  focused,
  changed,
  onToggle,
  onSelect,
  onFocus,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  focused: boolean;
  changed?: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const isDir = node.type === 'directory';
  return (
    <button
      type="button"
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={isDir ? expanded : undefined}
      data-file-path={node.path}
      onClick={onSelect}
      onFocus={onFocus}
      onDoubleClick={isDir ? onToggle : undefined}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 pr-2 text-[12px] transition-colors duration-150 hover:bg-bg-raised focus-visible:outline-none',
        selected && 'bg-[#7c8cf8]/10 text-[#7c8cf8]',
        !selected && 'text-text-primary',
      )}
      style={{ paddingLeft: `${depth * 14 + 6}px`, minHeight: 28 }}
    >
      {isDir ? (
        expanded ? (
          <ChevronDown className="h-3 w-3 text-text-secondary shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 text-text-secondary shrink-0" aria-hidden="true" />
        )
      ) : (
        <span className="w-3 shrink-0" aria-hidden="true" />
      )}

      {isDir ? (
        expanded ? (
          <FolderOpen className="h-3.5 w-3.5 text-[#7c8cf8]/70 shrink-0" aria-hidden="true" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-text-secondary shrink-0" aria-hidden="true" />
        )
      ) : (
        <File className="h-3.5 w-3.5 text-text-secondary shrink-0" aria-hidden="true" />
      )}

      <span className="truncate text-[12px]" title={node.name}>{node.name}</span>

      {changed && (
        <span
          aria-label="changed"
          title="Changed in this session"
          className="ml-auto h-1.5 w-1.5 rounded-full bg-[#7c8cf8] shrink-0"
        />
      )}
    </button>
  );
}

function cssEscape(value: string): string {
  if (typeof window !== 'undefined' && (window.CSS as { escape?: (s: string) => string } | undefined)?.escape) {
    return (window.CSS as { escape: (s: string) => string }).escape(value);
  }
  return value.replace(/(["\\\]\[])/g, '\\$1');
}
