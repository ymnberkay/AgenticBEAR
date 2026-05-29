import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Folder, ChevronRight, Home, ArrowLeft, X, Check } from 'lucide-react';
import { apiGet } from '../../api/client';

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
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Browse folders"
          style={{
            width: 36, height: 36, flexShrink: 0,
            background: 'var(--color-bg-base)',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-disabled)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; e.currentTarget.style.color = '#6EACDA'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
        >
          <FolderOpen style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {open && (
        <FolderModal
          initialPath={value || undefined}
          onSelect={(p) => { onChange(p); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FolderModal({ initialPath, onSelect, onClose }: {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [browsePath, setBrowsePath] = useState(initialPath ?? '');
  const { data, isLoading, isError } = useDirs(browsePath);

  // On first load with no initial path, use home from response
  const effectivePath = data?.path ?? browsePath;

  const pathParts = effectivePath.split('/').filter(Boolean);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(2,21,38,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 480, maxHeight: '70vh',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-default)',
        borderTop: '2px solid #6EACDA',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen style={{ width: 13, height: 13, color: '#6EACDA', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', flex: 1 }}>
            Select Folder
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: 2, display: 'flex' }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: 36 }}>
          {/* Home button */}
          {data?.home && (
            <button type="button" onClick={() => setBrowsePath(data.home)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
            >
              <Home style={{ width: 11, height: 11 }} />
            </button>
          )}
          {pathParts.map((part, i) => {
            const partPath = '/' + pathParts.slice(0, i + 1).join('/');
            return (
              <span key={partPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ChevronRight style={{ width: 10, height: 10, color: 'var(--color-text-disabled)' }} />
                <button
                  type="button"
                  onClick={() => setBrowsePath(partPath)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: i === pathParts.length - 1 ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    padding: '2px 4px',
                  }}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

        {/* Back + dir list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Back */}
          {data?.parent && (
            <button
              type="button"
              onClick={() => setBrowsePath(data.parent!)}
              className="flex items-center gap-2"
              style={{
                width: '100%', padding: '8px 16px', textAlign: 'left',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--color-border-subtle)',
                cursor: 'pointer', color: 'var(--color-text-disabled)',
                fontFamily: 'var(--font-mono)', fontSize: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(110,172,218,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <ArrowLeft style={{ width: 12, height: 12 }} />
              ..
            </button>
          )}

          {isLoading && (
            <div style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-disabled)' }}>
              loading...
            </div>
          )}
          {isError && (
            <div style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(251,73,52,0.7)' }}>
              Cannot read directory
            </div>
          )}
          {data?.entries.length === 0 && !isLoading && (
            <div style={{ padding: '20px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-disabled)' }}>
              no subdirectories
            </div>
          )}
          {data?.entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => setBrowsePath(entry.path)}
              className="flex items-center gap-2"
              style={{
                width: '100%', padding: '7px 16px', textAlign: 'left',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(110,172,218,0.05)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              <Folder style={{ width: 12, height: 12, color: '#6EACDA', flexShrink: 0 }} />
              {entry.name}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {effectivePath || '—'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 30, padding: '0 14px', background: 'transparent',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSelect(effectivePath)}
            className="flex items-center gap-1.5"
            style={{
              height: 30, padding: '0 14px', background: '#6EACDA',
              border: 'none', color: '#021526',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Check style={{ width: 12, height: 12 }} />
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
