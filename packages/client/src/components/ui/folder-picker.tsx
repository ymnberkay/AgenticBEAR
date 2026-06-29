import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Folder, ChevronRight, Home, ArrowLeft, Check, RefreshCw } from 'lucide-react';
import { apiGet } from '../../api/client';
import { Dialog } from './dialog';

interface DirEntry { name: string; path: string; }
interface DirListing { path: string; parent: string | null; home: string; entries: DirEntry[]; }

function useDirs(path: string) {
  return useQuery({
    queryKey: ['fs-dirs', path],
    queryFn: () => apiGet<DirListing>(`/api/fs/dirs?path=${encodeURIComponent(path)}`),
    staleTime: 30_000,
  });
}

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  inputStyle: React.CSSProperties;
}

export function FolderPickerInput({ value, onChange, inputStyle }: FolderPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/Users/you/projects"
          style={{ ...inputStyle, flex: 1 }}
          aria-label="Folder path"
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Browse folders"
          title="Browse folders"
          style={{
            width: 40, height: 40, flexShrink: 0,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-disabled)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.15s, color 0.15s',
            borderRadius: 'var(--radius-md)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; e.currentTarget.style.color = '#7c8cf8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
        >
          <FolderOpen style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      </div>

      <FolderModal
        open={open}
        initialPath={value || undefined}
        onSelect={(p) => { onChange(p); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function FolderModal({ open, initialPath, onSelect, onClose }: {
  open: boolean;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [browsePath, setBrowsePath] = useState(initialPath ?? '');
  const { data, isLoading, isError, error, refetch } = useDirs(browsePath);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const effectivePath = data?.path ?? browsePath;
  const pathParts = effectivePath.split('/').filter(Boolean);
  const entries = data?.entries ?? [];

  // Reset highlight when entries change.
  useEffect(() => { setActiveIdx(0); }, [data?.path, data?.entries?.length]);

  // Scroll selected item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-folder-item]');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(entries.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = entries[activeIdx];
      if (entry) setBrowsePath(entry.path);
    } else if (e.key === 'Backspace' && data?.parent) {
      e.preventDefault();
      setBrowsePath(data.parent);
    }
  };

  const canSelect = Boolean(effectivePath);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Select folder"
      maxWidth="520px"
      disableBackdropClose
    >
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          minHeight: 36, marginBottom: 8,
        }}
        aria-label="Folder breadcrumb"
      >
        {data?.home && (
          <button
            type="button"
            onClick={() => setBrowsePath(data.home)}
            aria-label="Go to home folder"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-disabled)', padding: '4px 6px',
              display: 'flex', alignItems: 'center', borderRadius: 4, minWidth: 28, minHeight: 28,
            }}
          >
            <Home style={{ width: 12, height: 12 }} aria-hidden="true" />
          </button>
        )}
        {pathParts.map((part, i) => {
          const partPath = '/' + pathParts.slice(0, i + 1).join('/');
          return (
            <span key={partPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ChevronRight aria-hidden="true" style={{ width: 10, height: 10, color: 'var(--color-text-disabled)' }} />
              <button
                type="button"
                onClick={() => setBrowsePath(partPath)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: i === pathParts.length - 1 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  padding: '4px 6px', minHeight: 28, borderRadius: 4,
                }}
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      {/* Listbox */}
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label="Folder contents"
        aria-activedescendant={entries[activeIdx] ? `folder-item-${activeIdx}` : undefined}
        onKeyDown={onListKey}
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          maxHeight: '50vh',
          overflowY: 'auto',
          outline: 'none',
        }}
      >
        {data?.parent && (
          <button
            type="button"
            onClick={() => setBrowsePath(data.parent!)}
            className="flex items-center gap-2"
            style={{
              width: '100%', padding: '10px 14px', textAlign: 'left',
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--color-border-subtle)',
              cursor: 'pointer', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              minHeight: 40,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ArrowLeft style={{ width: 12, height: 12 }} aria-hidden="true" />
            <span>.. (parent)</span>
          </button>
        )}

        {isLoading && (
          <div role="status" aria-live="polite" style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Loading folders…
          </div>
        )}
        {isError && (
          <div role="alert" style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(224,96,96,0.85)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>Cannot read directory: {(error as Error)?.message || effectivePath || '(unknown)'}</span>
            <button
              type="button"
              onClick={() => refetch()}
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: '1px solid rgba(224,96,96,0.3)',
                color: 'rgba(224,96,96,0.85)',
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RefreshCw style={{ width: 11, height: 11 }} aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        {entries.length === 0 && !isLoading && !isError && (
          <div style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            No subdirectories.
          </div>
        )}
        {entries.map((entry, i) => {
          const selected = i === activeIdx;
          return (
            <button
              key={entry.path}
              id={`folder-item-${i}`}
              data-folder-item
              role="option"
              aria-selected={selected}
              type="button"
              onClick={() => setBrowsePath(entry.path)}
              onMouseEnter={() => setActiveIdx(i)}
              className="flex items-center gap-2"
              style={{
                width: '100%', padding: '9px 14px', textAlign: 'left',
                background: selected ? 'rgba(124,140,248,0.08)' : 'transparent',
                borderLeft: selected ? '2px solid #7c8cf8' : '2px solid transparent',
                borderBottom: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                minHeight: 40,
              }}
            >
              <Folder style={{ width: 12, height: 12, color: '#7c8cf8', flexShrink: 0 }} aria-hidden="true" />
              {entry.name}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 14,
        }}
      >
        <span
          aria-live="polite"
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: effectivePath ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {effectivePath || 'No folder selected'}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 34, padding: '0 14px', background: 'transparent',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-mono)', fontSize: 12,
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSelect}
          onClick={() => onSelect(effectivePath)}
          className="flex items-center gap-1.5"
          style={{
            height: 34, padding: '0 14px',
            background: canSelect ? '#7c8cf8' : 'var(--color-bg-raised)',
            border: 'none',
            color: canSelect ? '#021526' : 'var(--color-text-disabled)',
            fontFamily: 'var(--font-mono)', fontSize: 12,
            fontWeight: 600,
            cursor: canSelect ? 'pointer' : 'not-allowed',
            opacity: canSelect ? 1 : 0.7,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Check style={{ width: 12, height: 12 }} aria-hidden="true" />
          Select
        </button>
      </div>
    </Dialog>
  );
}
